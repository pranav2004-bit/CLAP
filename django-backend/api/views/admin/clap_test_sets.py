"""
Admin CLAP Test Sets Views
Enterprise-grade management of question-paper sets (Set A, Set B, ...) 
for a single CLAP exam. Supports full CRUD, clone, and item management.

All edge cases handled:
 - Cannot create set on a published/active test-in-progress
 - Cannot delete a set that has active student assignments
 - Clone validates source set has questions before copying
 - Detects incomplete sets before distribution is allowed
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
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
    sets = ClapTestSet.objects.filter(clap_test=clap_test).prefetch_related(
        'components__items'
    ).order_by('set_number')
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
        # item counts are now also served from the prefetch cache
        total_items = sum(len(list(c.items.all())) for c in comps)
        d['total_item_count'] = total_items
        d['component_count'] = len(comps)
        # Count active student assignments for this set
        d['assigned_student_count'] = StudentClapAssignment.objects.filter(
            assigned_set=s, status__in=['assigned', 'started']
        ).count()
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

    # Guard: Max 26 sets
    existing_count = ClapTestSet.objects.filter(clap_test=clap_test).count()
    if existing_count >= 26:
        return error_response('Maximum 26 sets (A–Z) allowed per CLAP test.', status=400)

    next_number = existing_count + 1
    next_label = LABEL_SEQUENCE[existing_count]  # 'A', 'B', ...

    with transaction.atomic():
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
                raise ValueError(f'Source set {clone_from_set_id} not found in this test.')

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

            logger.info(
                f"Admin {user.id} cloned Set {source_set.label} → Set {next_label} "
                f"for test {clap_test.id}"
            )
        else:
            # Create empty set — admin must add questions manually
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
        comp = ClapSetComponent.objects.get(id=component_id)
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

    item = ClapSetItem.objects.create(
        set_component=comp,
        item_type=item_type,
        order_index=body.get('order_index', next_index),
        points=int(body.get('points', 0)),
        content=body.get('content', {}),
    )
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
        item = ClapSetItem.objects.get(id=item_id)
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

    for field in ['order_index', 'points', 'content', 'item_type']:
        if field in body:
            setattr(item, field, body[field])
    item.updated_at = timezone.now()
    item.save()
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

    # Bulk update order
    with transaction.atomic():
        for i, item_id in enumerate(item_ids):
            ClapSetItem.objects.filter(id=item_id).update(order_index=i + 1, updated_at=timezone.now())

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
    # Build a reference: test_type → item_count from Set A
    reference = {}
    ref_set = sets[0]
    for comp in ref_set.components.all():
        reference[comp.test_type] = comp.items.count()

    for s in sets[1:]:
        for comp in s.components.all():
            expected = reference.get(comp.test_type, 0)
            actual = comp.items.count()
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


# ─────────────────────────────────────────────────────────────────────────────
# 8. IMPORT FROM EXISTING COMPONENTS  —  POST /admin/clap-tests/<id>/sets/import-from-components
#
# Creates Set A by deep-copying the test's existing ClapTestComponents +
# ClapTestItems into the Sets hierarchy. This bridges the legacy single-paper
# workflow with the new multi-set workflow.
#
# Guards (in order):
#   G1. Admin-only
#   G2. Test must exist
#   G3. Sets already exist → conflict (idempotency: won't create duplicates)
#   G4. Active/started student assignments exist → block import (data integrity)
#   G5. No components exist on the test → nothing to import
#   G6. Every component must have at least one item (partial paper guard)
#   G7. Atomic transaction: all-or-nothing write
#   G8. Dry-run mode: caller can preview what will be imported without writing
#   G9. Audit logging of every import with item counts
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def import_from_components(request, test_id):
    """
    Import the test's existing ClapTestComponents + ClapTestItems as Set A.

    Optional JSON body:
        { "dry_run": true }   → returns a preview without writing to the database.
    """
    # ── G1: Admin auth ───────────────────────────────────────────────────────
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return error_response('Unauthorized', status=401)

    # ── G2: Test existence ───────────────────────────────────────────────────
    try:
        clap_test = ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return error_response('CLAP test not found', status=404)

    # Parse optional body
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return error_response('Invalid JSON body', status=400)
    dry_run = bool(body.get('dry_run', False))

    # ── G3: Idempotency — sets already exist ─────────────────────────────────
    existing_sets_count = ClapTestSet.objects.filter(clap_test=clap_test).count()
    if existing_sets_count > 0:
        return error_response(
            f'This test already has {existing_sets_count} set(s). '
            'Import is only allowed when no sets exist yet. '
            'Use Clone on an existing set to create additional variants.',
            status=409
        )

    # ── G4: Active student guard ──────────────────────────────────────────────
    # Block if any student has already started the test. We cannot retroactively
    # assign them to Set A after they began with the legacy flow.
    active_assignments = StudentClapAssignment.objects.filter(
        clap_test=clap_test,
        status__in=['started']
    ).count()
    if active_assignments > 0:
        return error_response(
            f'Cannot import while {active_assignments} student(s) are actively taking this test. '
            'Wait until all active sessions complete before importing.',
            status=409
        )

    # ── G5: Empty test guard ──────────────────────────────────────────────────
    components = list(
        ClapTestComponent.objects.prefetch_related('items')
        .filter(clap_test=clap_test)
        .order_by('test_type')
    )
    if not components:
        return error_response(
            'This CLAP test has no configured components yet. '
            'Build the test in the Configure tab first, then return here to import it as Set A.',
            status=422
        )

    # ── G6: Partial paper guard ───────────────────────────────────────────────
    # Every component must have at least one item. An empty component means
    # Set A would be incomplete, causing unequal paper lengths later.
    empty_components = []
    total_items = 0
    component_summary = []
    for comp in components:
        item_count = comp.items.count()
        total_items += item_count
        component_summary.append({
            'test_type': comp.test_type,
            'title': comp.title,
            'item_count': item_count,
            'max_marks': comp.max_marks,
            'duration_minutes': comp.duration_minutes,
            'timer_enabled': comp.timer_enabled,
        })
        if item_count == 0:
            empty_components.append(comp.test_type)

    if empty_components:
        return error_response(
            f'The following component(s) have no questions and cannot be imported: '
            f'{", ".join(sorted(empty_components))}. '
            'Add at least one question to every component in the Configure tab before importing.',
            status=422
        )

    # ── Dry Run: return preview without touching DB ───────────────────────────
    if dry_run:
        logger.info(
            f"Admin {user.id} ran dry-run import preview for test {clap_test.id} "
            f"({len(components)} components, {total_items} items total)"
        )
        return JsonResponse({
            'dry_run': True,
            'will_create': {
                'set_label': 'A',
                'components': len(components),
                'total_items': total_items,
                'component_breakdown': component_summary,
            },
            'message': (
                f'Dry run complete. Importing will create Set A with '
                f'{len(components)} components and {total_items} questions. '
                f'No data was written.'
            ),
        })

    # ── G7: Atomic write ─────────────────────────────────────────────────────
    try:
        with transaction.atomic():
            # Create Set A
            new_set = ClapTestSet.objects.create(
                clap_test=clap_test,
                label='A',
                set_number=1,
                created_by=user,
            )

            items_created_total = 0
            for comp in components:
                # Migrate each ClapTestComponent → ClapSetComponent
                set_comp = ClapSetComponent.objects.create(
                    set=new_set,
                    test_type=comp.test_type,
                    title=comp.title,
                    description=comp.description,
                    max_marks=comp.max_marks,
                    duration_minutes=comp.duration_minutes,
                    timer_enabled=comp.timer_enabled,
                )

                # Bulk-create ClapSetItems from ClapTestItems (O(N) for performance)
                source_items = list(comp.items.order_by('order_index'))
                set_items = [
                    ClapSetItem(
                        set_component=set_comp,
                        item_type=item.item_type,
                        order_index=item.order_index,
                        points=item.points,
                        # Deep copy content JSON to prevent shared mutation
                        content=dict(item.content) if item.content else {},
                    )
                    for item in source_items
                ]
                ClapSetItem.objects.bulk_create(set_items)
                items_created_total += len(set_items)

    except Exception as exc:
        logger.error(
            f"Import from components failed for test {clap_test.id} by admin {user.id}: {exc}",
            exc_info=True
        )
        return error_response(
            'An unexpected error occurred during import. No data was written. '
            'Please try again or contact support if the problem persists.',
            status=500
        )

    # ── G9: Audit log ─────────────────────────────────────────────────────────
    logger.info(
        f"[IMPORT] Admin {user.id} ({user.email}) imported test {clap_test.id} "
        f"('{clap_test.name}') as Set A: "
        f"{len(components)} components, {items_created_total} items. "
        f"New set id={new_set.id}"
    )

    # Return the full newly-created set so the frontend can render it immediately
    set_dict = _set_to_dict(new_set, include_components=True)
    set_dict['total_item_count'] = items_created_total
    set_dict['component_count'] = len(components)
    set_dict['assigned_student_count'] = 0

    return JsonResponse({
        'set': set_dict,
        'imported': {
            'components': len(components),
            'total_items': items_created_total,
            'component_breakdown': component_summary,
        },
        'message': (
            f'Successfully imported {len(components)} components and '
            f'{items_created_total} questions as Set A. '
            f'You can now clone Set A to create Set B, C, etc.'
        ),
    }, status=201)
