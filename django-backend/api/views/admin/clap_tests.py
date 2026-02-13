"""
Admin CLAP Test Management Views
Maintains exact behavior from Next.js app/api/admin/clap-tests/route.ts
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.db.models import Q
import json
import logging

from api.models import ClapTest, ClapTestComponent, Batch, User, StudentClapAssignment, ClapTestIdCounter
from api.utils import success_response, error_response

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["GET"])
def list_clap_tests(request):
    """
    GET /api/admin/clap-tests
    Matches Next.js GET function behavior
    """
    try:
        # Fetch CLAP tests with related data
        clap_tests = ClapTest.objects.filter(
            ~Q(status='deleted')
        ).select_related('batch').prefetch_related('components').order_by('-created_at')
        
        # Transform data to match frontend expectations
        transformed_tests = []
        for test in clap_tests:
            test_dict = {
                'id': str(test.id),
                'test_id': test.test_id,  # Add custom ID
                'name': test.name,
                'batch_id': str(test.batch_id) if test.batch_id else None,
                'batch_name': test.batch.batch_name if test.batch else 'Unknown Batch',
                'status': test.status,
                'is_assigned': bool(test.batch_id),
                'created_at': test.created_at.isoformat(),
                'tests': []
            }
            
            # Transform components
            for comp in test.components.all():
                test_dict['tests'].append({
                    'id': str(comp.id),
                    'name': comp.title,
                    'type': comp.test_type,
                    'status': comp.status
                })
            
            transformed_tests.append(test_dict)
        
        return JsonResponse({'clapTests': transformed_tests})
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response('Internal server error', status=500)


@csrf_exempt
@require_http_methods(["POST"])
def create_clap_test(request):
    """
    POST /api/admin/clap-tests
    Matches Next.js POST function behavior
    """
    try:
        body = json.loads(request.body)
        test_name = body.get('testName')
        batch_id = body.get('batchId')
        
        if not test_name or not batch_id:
            return error_response('Test name and batch are required', status=400)
        
        with transaction.atomic():
            # Generate custom CLAP ID
            # Use select_for_update to lock the row and prevent race conditions
            counter, created = ClapTestIdCounter.objects.select_for_update().get_or_create(id=1)
            counter.last_number += 1
            counter.save()
            
            test_id_str = f"clap{counter.last_number}"
            
            # Create the CLAP test
            clap_test = ClapTest.objects.create(
                test_id=test_id_str,
                name=test_name,
                batch_id=batch_id,
                status='published'
            )
            
            # Create the 5 test components
            test_components = [
                {'test_type': 'listening', 'title': 'Listening Test', 'description': 'Audio comprehension test'},
                {'test_type': 'speaking', 'title': 'Speaking Test', 'description': 'Oral communication assessment'},
                {'test_type': 'reading', 'title': 'Reading Test', 'description': 'Reading comprehension assessment'},
                {'test_type': 'writing', 'title': 'Writing Test', 'description': 'Written expression assessment'},
                {'test_type': 'vocabulary', 'title': 'Vocabulary & Grammar Test', 'description': 'Language fundamentals assessment'}
            ]
            
            components_to_create = []
            for component in test_components:
                components_to_create.append(ClapTestComponent(
                    clap_test=clap_test,
                    test_type=component['test_type'],
                    title=component['title'],
                    description=component['description']
                ))
            
            ClapTestComponent.objects.bulk_create(components_to_create)
            
            # Automatically assign to all students in the batch
            students = User.objects.filter(batch_id=batch_id, role='student')
            
            if students.exists():
                assignments = []
                for student in students:
                    assignments.append(StudentClapAssignment(
                        student=student,
                        clap_test=clap_test
                    ))
                
                StudentClapAssignment.objects.bulk_create(assignments, ignore_conflicts=True)
        
        # Fetch the created test with components
        clap_test.refresh_from_db()
        components = clap_test.components.all()
        batch = clap_test.batch
        
        transformed_test = {
            'id': str(clap_test.id),
            'test_id': clap_test.test_id,  # Add custom ID
            'name': clap_test.name,
            'batch_id': str(clap_test.batch_id),
            'batch_name': batch.batch_name if batch else 'Unknown Batch',
            'status': clap_test.status,
            'created_at': clap_test.created_at.isoformat(),
            'tests': [
                {
                    'id': comp.test_type,
                    'name': comp.title,
                    'type': comp.test_type,
                    'status': comp.status
                }
                for comp in components
            ]
        }
        
        return JsonResponse({
            'message': 'CLAP test created successfully',
            'clapTest': transformed_test
        })
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Internal server error', status=500)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def clap_tests_handler(request):
    """
    Combined handler for GET and POST requests to /api/admin/clap-tests
    Routes to appropriate function based on request method
    """
    if request.method == "GET":
        return list_clap_tests(request)
    elif request.method == "POST":
        return create_clap_test(request)

