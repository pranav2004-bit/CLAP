"""
Admin Batch Management Views
Maintains exact behavior from Next.js app/api/admin/batches/route.ts
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Count
import json
import logging
import time

from api.models import Batch, User
from api.utils import success_response, error_response, bad_request_response

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def list_batches(request):
    """
    GET /api/admin/batches
    Matches Next.js GET function behavior
    """
    try:
        start_time = time.time()
        logger.info('batch-fetch started')
        
        # Only show ACTIVE batches in the interface
        # Deleted batches are hidden but all data is preserved in database
        batches = Batch.objects.filter(
            is_active=True
        ).values(
            'id', 'batch_name', 'start_year', 'end_year', 'is_active', 'created_at'
        ).order_by('-created_at')[:50]  # Limit results for better performance
        
        batch_list = list(batches)
        
        # Get student counts separately for better performance
        batch_ids = [b['id'] for b in batch_list]
        student_counts = {}
        
        if batch_ids:
            students = User.objects.filter(
                batch_id__in=batch_ids,
                role='student'
            ).values('batch_id').annotate(count=Count('id'))
            
            student_counts = {str(s['batch_id']): s['count'] for s in students}
        
        # Transform the data - match Next.js transformation
        batches_with_counts = []
        for batch in batch_list:
            batch_dict = dict(batch)
            batch_dict['id'] = str(batch_dict['id'])
            batch_dict['student_count'] = student_counts.get(str(batch['id']), 0)
            batch_dict['created_at'] = batch_dict['created_at'].isoformat()
            batches_with_counts.append(batch_dict)
        
        elapsed_time = time.time() - start_time
        logger.info(f'batch-fetch completed in {elapsed_time:.3f}s')
        
        return JsonResponse({'batches': batches_with_counts})
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response('Internal server error', status=500)


@csrf_exempt
@require_http_methods(["POST"])
def create_batch(request):
    """
    POST /api/admin/batches
    Matches Next.js POST function behavior
    
    IMPORTANT: If a deleted batch with the same name exists, it will be REACTIVATED
    instead of creating a duplicate. This also reactivates all student accounts.
    """
    try:
        start_time = time.time()
        logger.info('POST /api/admin/batches called')
        
        body = json.loads(request.body)
        logger.info(f'Request body: {body}')
        
        batch_name = body.get('batch_name')
        start_year = body.get('start_year')
        end_year = body.get('end_year')
        
        # Validate inputs - match Next.js validation
        if not batch_name or not start_year or not end_year:
            logger.info('Missing required fields')
            elapsed_time = time.time() - start_time
            logger.info(f'batch-create completed in {elapsed_time:.3f}s')
            return error_response(
                'Batch name, start year, and end year are required',
                status=400
            )
        
        try:
            start_year_int = int(start_year)
            end_year_int = int(end_year)
        except (ValueError, TypeError):
            elapsed_time = time.time() - start_time
            logger.info(f'batch-create completed in {elapsed_time:.3f}s')
            return error_response(
                'Start year and end year must be valid numbers',
                status=400
            )
        
        if start_year_int >= end_year_int:
            elapsed_time = time.time() - start_time
            logger.info(f'batch-create completed in {elapsed_time:.3f}s')
            return error_response(
                'End year must be greater than start year',
                status=400
            )
        
        
        # Check if batch already exists (including inactive ones)
        existing_batch = Batch.objects.filter(batch_name=batch_name).first()
        
        if existing_batch:
            # If batch exists but is inactive, reactivate it
            if not existing_batch.is_active:
                logger.info(f'Reactivating deleted batch: {batch_name}')
                existing_batch.is_active = True
                existing_batch.start_year = start_year_int
                existing_batch.end_year = end_year_int
                existing_batch.save()
                
                # CRITICAL: Reactivate all students in this batch
                # When batch is restored, all student accounts should be reactivated
                # This allows students to login again
                students_reactivated = User.objects.filter(
                    batch_id=existing_batch.id,
                    role='student'
                ).update(is_active=True)
                
                logger.info(f'Reactivated {students_reactivated} student accounts')
                
                batch_data = {
                    'id': str(existing_batch.id),
                    'batch_name': existing_batch.batch_name,
                    'start_year': existing_batch.start_year,
                    'end_year': existing_batch.end_year,
                    'is_active': existing_batch.is_active,
                    'created_at': existing_batch.created_at.isoformat(),
                    'updated_at': existing_batch.updated_at.isoformat()
                }
                
                logger.info(f'Batch reactivated successfully: {batch_data}')
                elapsed_time = time.time() - start_time
                logger.info(f'batch-create completed in {elapsed_time:.3f}s')
                
                return JsonResponse({'batch': batch_data}, status=201)
            else:
                # Batch exists and is active - return error
                logger.info(f'Batch already exists and is active: {batch_name}')
                elapsed_time = time.time() - start_time
                logger.info(f'batch-create completed in {elapsed_time:.3f}s')
                return error_response(
                    f'Batch {batch_name} already exists',
                    status=409
                )
        
        # Create the batch
        batch = Batch.objects.create(
            batch_name=batch_name,
            start_year=start_year_int,
            end_year=end_year_int,
            is_active=True
        )
        
        batch_data = {
            'id': str(batch.id),
            'batch_name': batch.batch_name,
            'start_year': batch.start_year,
            'end_year': batch.end_year,
            'is_active': batch.is_active,
            'created_at': batch.created_at.isoformat(),
            'updated_at': batch.updated_at.isoformat()
        }
        
        logger.info(f'Batch created successfully: {batch_data}')
        elapsed_time = time.time() - start_time
        logger.info(f'batch-create completed in {elapsed_time:.3f}s')
        
        return JsonResponse({'batch': batch_data}, status=201)

        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Internal server error', status=500)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def batches_handler(request):
    """
    Combined handler for GET and POST requests to /api/admin/batches
    Routes to appropriate function based on request method
    """
    if request.method == "GET":
        return list_batches(request)
    elif request.method == "POST":
        return create_batch(request)
