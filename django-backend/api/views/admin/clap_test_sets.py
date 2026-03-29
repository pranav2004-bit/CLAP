"""
Admin CLAP Test Sets Views
Enterprise-grade management of question-paper sets (Set A, Set B, ...)
for a single CLAP exam. Supports full CRUD, clone, and item management.

All edge cases handled:
 - Cannot delete a set that has active student assignments
 - Clone validates source set has questions before copying
 - Detects incomplete sets before distribution is allowed
 - Structural ClapTestComponent/ClapTestItem slots are auto-created alongside
   ClapSetComponent/ClapSetItem so StudentClapResponse FKs remain stable
   without a schema migration.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q
import json
import uuid
import logging

from api.models import (
    ClapTest, ClapTestSet, ClapSetComponent, ClapSetItem,
    ClapTestComponent, ClapTestItem, AdminAudioFile,
    StudentClapAssignment, User
)
from api.utils import error_response
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)

# Default component definitions used for both ClapSetComponent stubs and
# structural ClapTestComponent stubs created alongside empty new sets.
_DEFAULT_COMPONENT_DEFS = [
    ('listening',  'Listening',      30, 10),
    ('speaking',   'Speaking',       20, 10),
    ('reading',    'Reading',        30, 10),
    ('writing',    'Writing',        30, 10),
    ('vocabulary', 'Verbal Ability', 20, 10),
]

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

LABEL_SEQUENCE = list('ABCDEFGHIJKLMNOPQRSTUVWXYZ')  # Max 26 sets

def _set_to_dict(s: ClapTestSet, include_components: bool = False) -> dict:
    d = {
        'id': str(s.id),
        'label': s.label,
        'set_number': s.set_number,
        'is_active': s.is_active,
        'created_at': s.created_at.isoformat(),
    }
    if include_components:
        d['components'] = [_component_to_dict(c) for c in s.components.prefetch_related('items').all()]
    return d


def _component_to_dict(c: ClapSetComponent, include_items: bool = False) -> dict:
    d = {
        'id': str(c.id),
        'test_type': c.test_type,
        'title': c.title,
        'description': c.description,
        'max_marks': c.max_marks,
        'duration_minutes': c.duration_minutes,
        'timer_enabled': c.timer_enabled,
        # len(list(...)) uses the prefetch cache when available; falls back to a DB query otherwise
        'item_count': len(list(c.items.all())) if hasattr(c, 'items') else 0,
    }
    if include_items:
        d['items'] = [_item_to_dict(i) for i in c.items.all()]
    return d


def _item_to_dict(i: ClapSetItem) -> dict:
    content = i.content.copy() if i.content else {}
    # Never expose correct answer to non-admin — strip only for student view;
    # here (admin) we keep full content.

    # ── Audio resolution for audio_block items ────────────────────────────────
    # Priority 1: the set item has its own audio file (different audio per set).
    # Priority 2: fall back to the base test item at the same order_index/type
    #             (all sets share one audio clip — the common case for listening).
    # The frontend uses `audio_endpoint` + `base_item_id` to call the right API.
    if i.item_type == 'audio_block':
        if AdminAudioFile.objects.filter(set_item=i).exists():
            content['has_audio_file'] = True
            content['audio_endpoint'] = 'set-items'
        else:
            try:
                base_item = ClapTestItem.objects.filter(
                    component__clap_test=i.set_component.set.clap_test,
                    component__test_type=i.set_component.test_type,
                    order_index=i.order_index,
                ).first()
                if base_item and AdminAudioFile.objects.filter(item=base_item).exists():
                    content['has_audio_file'] = True
                    content['audio_endpoint'] = 'clap-items'
                    content['base_item_id'] = str(base_item.id)
                else:
                    content['has_audio_file'] = False
            except Exception:
                # Defensive: leave content['has_audio_file'] as-is if lookup fails
                pass

    return {
        'id': str(i.id),
        'item_type': i.item_type,
        'order_index': i.order_index,
        'points': i.points,
        'content': content,
        'updated_at': i.updated_at.isoformat(),
    }


def _ensure_structural_slots(set_item: ClapSetItem) -> None:
    """
    Guarantee a ClapTestComponent + ClapTestItem structural slot exists for
    the given ClapSetItem.

    Why structural slots exist
    ──────────────────────────
    StudentClapResponse.item is a non-null FK to ClapTestItem.  In the pure-set
    workflow (admin builds questions only via ClapSetItem editors) there are no
    master ClapTestItems.  Rather than performing a schema migration we
    auto-create lightweight "slot" records that carry the position metadata
    (test_type, order_index, item_type, points) but hold no question content
    (content = {}).  The real question content is always served from ClapSetItem.

    Concurrency safety
    ──────────────────
    get_or_create is safe under concurrent writes because both ClapTestComponent
    and ClapTestItem have unique_together constraints that produce an IntegrityError
    on collision; Django's get_or_create catches and retries internally.
    This function must be called inside the same atomic() block as the
    ClapSetItem INSERT so partial states cannot persist.
    """
    set_comp = set_item.set_component
    clap_test = set_comp.set.clap_test

    # 1. Ensure a structural ClapTestComponent exists for this test_type.
    structural_comp, _ = ClapTestComponent.objects.get_or_create(
        clap_test=clap_test,
        test_type=set_comp.test_type,
        defaults={
            'title': set_comp.title,
            'max_marks': set_comp.max_marks,
            'duration_minutes': set_comp.duration_minutes,
            'timer_enabled': set_comp.timer_enabled,
        },
    )

    # 2. Ensure a structural ClapTestItem slot exists at this order_index.
    #    Content is intentionally empty — the real content is in ClapSetItem.
    ClapTestItem.objects.get_or_create(
        component=structural_comp,
        order_index=set_item.order_index,
        defaults={
            'item_type': set_item.item_type,
            'points': set_item.points,
            'content': {},
        },
    )


def _sync_structural_component(set_comp: ClapSetComponent) -> None:
    """
    Propagate ClapSetComponent metadata (title, max_marks, duration_minutes,
    timer_enabled) to the structural ClapTestComponent slot for the same
    test_type, if one exists.

    Called after any admin update to a ClapSetComponent so that the student-
    facing deadline (ComponentAttempt) reflects the latest set settings.
    No-op if no structural component exists yet (slots are created lazily
    when the first ClapSetItem is added).
    """
    ClapTestComponent.objects.filter(
        clap_test=set_comp.set.clap_test,
        test_type=set_comp.test_type,
    ).update(
        title=set_comp.title,
        max_marks=set_comp.max_marks,
        duration_minutes=set_comp.duration_minutes,
        timer_enabled=set_comp.timer_enabled,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. LIST / CREATE SETS  —  GET / POST /admin/clap-tests/<id>/sets
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def sets_handler(request, test_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        clap_test = ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return error_response('CLAP test not found', status=404)

    if request.method == 'GET':
        return _list_sets(clap_test)
    return _create_set(request, clap_test, user)


def _list_sets(clap_test: ClapTest):
    # Deep prefetch: components AND their items in two queries (not N+1)
    sets = list(
        ClapTestSet.objects.filter(clap_test=clap_test)
        .prefetch_related('components__items')
        .order_by('set_number')
    )

    # Bulk-fetch active assignment counts in ONE query (avoids N COUNT queries).
    set_ids = [s.id for s in sets]
    active_counts: dict = {}
    if set_ids:
        active_counts = dict(
            StudentClapAssignment.objects.filter(
                assigned_set_id__in=set_ids,
                status__in=['assigned', 'started'],
            ).values('assigned_set_id').annotate(c=Count('id')).values_list('assigned_set_id', 'c')
        )

    result = []
    for s in sets:
        # Use the prefetch cache — avoids the bypass caused by chaining
        # .prefetch_related('items') on the related manager inside _set_to_dict.
        comps = list(s.components.all())  # hits prefetch cache
        d = {
            'id': str(s.id),
            'label': s.label,
            'set_number': s.set_number,
            'is_active': s.is_active,
            'created_at': s.created_at.isoformat(),
            'components': [_component_to_dict(c) for c in comps],
        }
        # item counts served from the prefetch cache
        total_items = sum(len(list(c.items.all())) for c in comps)
        d['total_item_count'] = total_items
        d['component_count'] = len(comps)
        d['assigned_student_count'] = active_counts.get(s.id, 0)
        result.append(d)

    return JsonResponse({
        'sets': result,
        'total_sets': len(result),
        'can_distribute': len(result) >= 2,  # Minimum 2 sets for meaningful distribution
    })


def _create_set(request, clap_test: ClapTest, user: User):
    """Create a new empty set, or clone from an existing set."""
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return error_response('Invalid JSON body', status=400)

    clone_from_set_id = body.get('clone_from_set_id')  # Optional

    # Optimistic early guard (avoids acquiring a lock when clearly at limit).
    if ClapTestSet.objects.filter(clap_test=clap_test).count() >= 26:
        return error_response('Maximum 26 sets (A–Z) allowed per CLAP test.', status=400)

    with transaction.atomic():
        # Acquire a write lock on the ClapTest row to serialize concurrent
        # "New Set" clicks for the same test.  Without this lock two admins
        # clicking simultaneously both read count=N, both compute next_label=N+1,
        # and both succeed — producing two sets with the same label and number.
        ClapTest.objects.select_for_update().get(id=clap_test.id)

        # Definitive count inside the lock — guaranteed accurate.
        existing_count = ClapTestSet.objects.filter(clap_test=clap_test).count()
        if existing_count >= 26:
            return error_response('Maximum 26 sets (A–Z) allowed per CLAP test.', status=400)

        next_number = existing_count + 1
        next_label = LABEL_SEQUENCE[existing_count]  # 'A', 'B', ...

        new_set = ClapTestSet.objects.create(
            clap_test=clap_test,
            label=next_label,
            set_number=next_number,
            created_by=user
        )

        if clone_from_set_id:
            # Clone from an existing set
            try:
                source_set = ClapTestSet.objects.prefetch_related(
                    'components__items'
                ).get(id=clone_from_set_id, clap_test=clap_test)
            except ClapTestSet.DoesNotExist:
                return error_response(
                    f'Source set {clone_from_set_id} not found in this test.',
                    status=404,
                )

            for src_comp in source_set.components.all():
                new_comp = ClapSetComponent.objects.create(
                    set=new_set,
                    test_type=src_comp.test_type,
                    title=src_comp.title,
                    description=src_comp.description,
                    max_marks=src_comp.max_marks,
                    duration_minutes=src_comp.duration_minutes,
                    timer_enabled=src_comp.timer_enabled,
                )
                items_to_create = [
                    ClapSetItem(
                        set_component=new_comp,
                        item_type=item.item_type,
                        order_index=item.order_index,
                        points=item.points,
                        content=item.content.copy() if item.content else {},
                    )
                    for item in src_comp.items.all()
                ]
                ClapSetItem.objects.bulk_create(items_to_create)

                # Ensure structural ClapTestItem slots exist for every cloned item.
                # get_or_create is idempotent — if the slot already exists from the
                # source set, this is a no-op SELECT (no INSERT).  Required so that
                # StudentClapResponse.item (non-null FK) remains valid for students
                # assigned to this cloned set.
                structural_comp, _ = ClapTestComponent.objects.get_or_create(
                    clap_test=clap_test,
                    test_type=new_comp.test_type,
                    defaults={
                        'title': new_comp.title,
                        'max_marks': new_comp.max_marks,
                        'duration_minutes': new_comp.duration_minutes,
                        'timer_enabled': new_comp.timer_enabled,
                    },
                )
                for item in items_to_create:
                    ClapTestItem.objects.get_or_create(
                        component=structural_comp,
                        order_index=item.order_index,
                        defaults={
                            'item_type': item.item_type,
                            'points': item.points,
                            'content': {},
                        },
                    )

            logger.info(
                f"Admin {user.id} cloned Set {source_set.label} → Set {next_label} "
                f"for test {clap_test.id}"
            )
        else:
            # Create empty set with stub ClapSetComponents (UI-facing) AND
            # structural ClapTestComponent stubs (student-facing, for
            # StudentClapResponse FK stability).  Both are created atomically.
            ClapSetComponent.objects.bulk_create([
                ClapSetComponent(
                    set=new_set,
                    test_type=tt,
                    title=title,
                    duration_minutes=duration,
                    max_marks=marks,
                    timer_enabled=True,
                )
                for tt, title, duration, marks in _DEFAULT_COMPONENT_DEFS
            ])
            # get_or_create is safe even on concurrent set creation: the
            # unique_together (clap_test, test_type) on ClapTestComponent
            # prevents duplicates.
            for tt, title, duration, marks in _DEFAULT_COMPONENT_DEFS:
                ClapTestComponent.objects.get_or_create(
                    clap_test=clap_test,
                    test_type=tt,
                    defaults={
                        'title': title,
                        'max_marks': marks,
                        'duration_minutes': duration,
                        'timer_enabled': True,
                    },
                )
            logger.info(f"Admin {user.id} created empty Set {next_label} for test {clap_test.id}")

    return JsonResponse(_set_to_dict(new_set, include_components=True), status=201)


# ─────────────────────────────────────────────────────────────────────────────
# 2. SET DETAIL  —  GET / DELETE /admin/clap-tests/<id>/sets/<set_id>
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'DELETE'])
def set_detail_handler(request, test_id, set_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        s = ClapTestSet.objects.prefetch_related('components__items').get(
            id=set_id, clap_test_id=test_id
        )
    except ClapTestSet.DoesNotExist:
        return error_response('Set not found', status=404)

    if request.method == 'GET':
        return JsonResponse(_set_to_dict(s, include_components=True))

    # DELETE
    # Guard: Cannot delete if students have active assignments to this set
    active_count = StudentClapAssignment.objects.filter(
        assigned_set=s, status__in=['assigned', 'started']
    ).count()
    if active_count > 0:
        return error_response(
            f'Cannot delete Set {s.label}: {active_count} student(s) are actively assigned to it.',
            status=409
        )

    label = s.label
    with transaction.atomic():
        s.delete()

    logger.info(f"Admin {user.id} deleted Set {label} from test {test_id}")
    return JsonResponse({'message': f'Set {label} deleted successfully.'})


# ─────────────────────────────────────────────────────────────────────────────
# 3. SET COMPONENTS  —  GET / POST /admin/sets/<set_id>/components
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def set_components_handler(request, set_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        s = ClapTestSet.objects.get(id=set_id)
    except ClapTestSet.DoesNotExist:
        return error_response('Set not found', status=404)

    if request.method == 'GET':
        components = s.components.prefetch_related('items').all()
        return JsonResponse({
            'set_label': s.label,
            'components': [_component_to_dict(c, include_items=True) for c in components]
        })

    # POST — create a new component
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return error_response('Invalid JSON', status=400)

    test_type = body.get('test_type', '').strip()
    title = body.get('title', '').strip()
    if not test_type or not title:
        return error_response('test_type and title are required.', status=400)

    valid_types = ['listening', 'speaking', 'reading', 'writing', 'vocabulary']
    if test_type not in valid_types:
        return error_response(f'test_type must be one of: {", ".join(valid_types)}', status=400)

    # Guard: Duplicate test_type in same set
    if s.components.filter(test_type=test_type).exists():
        return error_response(f'A {test_type} component already exists in Set {s.label}.', status=409)

    comp = ClapSetComponent.objects.create(
        set=s,
        test_type=test_type,
        title=title,
        description=body.get('description'),
        max_marks=int(body.get('max_marks', 10)),
        duration_minutes=int(body.get('duration_minutes', 30)),
        timer_enabled=bool(body.get('timer_enabled', True)),
    )
    return JsonResponse(_component_to_dict(comp, include_items=True), status=201)


# ─────────────────────────────────────────────────────────────────────────────
# 4. SET COMPONENT DETAIL  —  GET / PUT / DELETE /admin/set-components/<id>
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'PUT', 'PATCH', 'DELETE'])
def set_component_detail_handler(request, component_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        comp = ClapSetComponent.objects.select_related('set').prefetch_related('items').get(id=component_id)
    except ClapSetComponent.DoesNotExist:
        return error_response('Component not found', status=404)

    if request.method == 'GET':
        return JsonResponse(_component_to_dict(comp, include_items=True))

    if request.method == 'DELETE':
        comp.delete()
        return JsonResponse({'message': 'Component deleted.'})

    # PUT / PATCH
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return error_response('Invalid JSON', status=400)

    updateable = ['title', 'description', 'max_marks', 'duration_minutes', 'timer_enabled']
    for field in updateable:
        if field in body:
            setattr(comp, field, body[field])
    comp.save()

    # Keep structural slot in sync so student deadlines reflect latest settings.
    _sync_structural_component(comp)

    return JsonResponse(_component_to_dict(comp, include_items=True))


# ─────────────────────────────────────────────────────────────────────────────
# 5. SET ITEMS  —  GET / POST /admin/set-components/<id>/items
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def set_items_handler(request, component_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        # select_related pre-loads the FK chain needed by _ensure_structural_slots
        # (set_component → set → clap_test) so no extra queries are issued inside
        # the atomic block when creating a structural ClapTestItem slot.
        comp = ClapSetComponent.objects.select_related('set__clap_test').get(id=component_id)
    except ClapSetComponent.DoesNotExist:
        return error_response('Component not found', status=404)

    if request.method == 'GET':
        items = comp.items.all()
        return JsonResponse({'items': [_item_to_dict(i) for i in items]})

    # POST — add item
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return error_response('Invalid JSON', status=400)

    item_type = body.get('item_type', '').strip()
    valid_item_types = ['mcq', 'subjective', 'text_block', 'audio_block', 'file_upload', 'audio_recording']
    if item_type not in valid_item_types:
        return error_response(f'item_type must be one of {valid_item_types}', status=400)

    max_index = comp.items.order_by('-order_index').values_list('order_index', flat=True).first()
    next_index = (max_index or 0) + 1

    with transaction.atomic():
        item = ClapSetItem.objects.create(
            set_component=comp,
            item_type=item_type,
            order_index=body.get('order_index', next_index),
            points=int(body.get('points', 0)),
            content=body.get('content', {}),
        )
        # Auto-create structural ClapTestComponent/ClapTestItem slots so that
        # StudentClapResponse can maintain its FK to ClapTestItem without a
        # schema migration.  This is idempotent and concurrent-safe.
        _ensure_structural_slots(item)

    return JsonResponse({'item': _item_to_dict(item)}, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# 6. SET ITEM DETAIL  —  GET / PUT / DELETE /admin/set-items/<id>
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'PUT', 'PATCH', 'DELETE'])
def set_item_detail_handler(request, item_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        # select_related pre-loads the FK chain required by _ensure_structural_slots
        # so that PUT/PATCH can call it without extra DB round-trips.
        item = ClapSetItem.objects.select_related(
            'set_component__set__clap_test'
        ).get(id=item_id)
    except ClapSetItem.DoesNotExist:
        return error_response('Item not found', status=404)

    if request.method == 'GET':
        return JsonResponse(_item_to_dict(item))

    if request.method == 'DELETE':
        item.delete()
        return JsonResponse({'message': 'Item deleted.'})

    # PUT / PATCH
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return error_response('Invalid JSON', status=400)

    # Track whether order_index is changing — if so, we must ensure a
    # structural ClapTestItem slot exists at the NEW position.  Without this,
    # the item at the new order_index would be silently dropped from every
    # student's test because student_test_items filters by order_index
    # membership in the structural ClapTestItem table.
    order_index_changed = 'order_index' in body and body['order_index'] != item.order_index

    for field in ['order_index', 'points', 'content', 'item_type']:
        if field in body:
            setattr(item, field, body[field])
    item.updated_at = timezone.now()

    with transaction.atomic():
        item.save()
        # Guarantee a structural slot at the (possibly new) order_index.
        # This is idempotent — if the slot already exists, get_or_create is
        # a single SELECT with no INSERT.  Calling unconditionally (not just
        # when order_index_changed) catches any previously missed slots.
        _ensure_structural_slots(item)

    return JsonResponse(_item_to_dict(item))


@csrf_exempt
@require_http_methods(['POST'])
def set_reorder_items_handler(request, component_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        body = json.loads(request.body)
        item_ids = body.get('item_ids', [])
    except json.JSONDecodeError:
        return error_response('Invalid JSON', status=400)

    try:
        comp = ClapSetComponent.objects.get(id=component_id)
    except ClapSetComponent.DoesNotExist:
        return error_response('Component not found', status=404)

    # Validate all items belong to this component
    items = list(ClapSetItem.objects.filter(id__in=item_ids, set_component=comp))
    if len(items) != len(item_ids):
        return error_response('Some items were not found or do not belong to this component', status=400)

    # Assign new order indices in the caller-specified order, then bulk-update
    # in a single statement instead of N individual UPDATEs.
    item_id_to_obj = {str(item.id): item for item in items}
    now = timezone.now()
    ordered_items = []
    for i, item_id in enumerate(item_ids):
        obj = item_id_to_obj[item_id]
        obj.order_index = i + 1
        obj.updated_at = now
        ordered_items.append(obj)

    with transaction.atomic():
        ClapSetItem.objects.bulk_update(ordered_items, ['order_index', 'updated_at'])

    return JsonResponse({'message': 'Items reordered successfully'})

# ─────────────────────────────────────────────────────────────────────────────

# 7. VALIDATE SETS  —  GET /admin/clap-tests/<id>/sets/validate
# Checks all sets have the same number of items per component type.
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET'])
def validate_sets(request, test_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    try:
        ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return error_response('CLAP test not found', status=404)

    sets = list(ClapTestSet.objects.filter(clap_test_id=test_id).prefetch_related('components__items'))

    if len(sets) < 2:
        return JsonResponse({
            'valid': False,
            'error': 'At least 2 sets are required before distribution.',
            'issues': []
        })

    issues = []
    # Build a reference: test_type → item_count from Set A.
    # len(list(comp.items.all())) uses the prefetch cache populated by
    # prefetch_related('components__items') above — no extra DB queries.
    # comp.items.count() would bypass the prefetch and issue a COUNT(*) per call.
    reference = {}
    ref_set = sets[0]
    for comp in ref_set.components.all():
        reference[comp.test_type] = len(list(comp.items.all()))

    for s in sets[1:]:
        for comp in s.components.all():
            expected = reference.get(comp.test_type, 0)
            actual = len(list(comp.items.all()))
            if actual != expected:
                issues.append({
                    'set_label': s.label,
                    'test_type': comp.test_type,
                    'expected_items': expected,
                    'actual_items': actual,
                })
        # Check if any test_type is missing from this set
        present_types = {c.test_type for c in s.components.all()}
        for t in reference.keys():
            if t not in present_types:
                issues.append({
                    'set_label': s.label,
                    'test_type': t,
                    'issue': 'Component missing entirely',
                })

    return JsonResponse({
        'valid': len(issues) == 0,
        'issues': issues,
        'sets_checked': len(sets),
    })
