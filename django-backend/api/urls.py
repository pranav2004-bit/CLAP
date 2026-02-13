"""
API URL Configuration
Maintains exact URL structure from Next.js API routes
Complete coverage of all 23 endpoints
"""

from django.urls import path
from api.views.admin import (
    batches, 
    students, 
    student_detail, 
    clap_tests,
    batch_detail,
    student_password,
    clap_test_detail,
    clap_test_assignment,
    student_toggle_active,
    clap_test_items,
    clap_components
)
from api.views.student import profile, clap_attempt
from api.views import evaluate

app_name = 'api'

urlpatterns = [
    # ============================================
    # ADMIN - BATCH MANAGEMENT (5 endpoints)
    # ============================================
    path('admin/batches', batches.batches_handler, name='admin_batches'),
    path('admin/batches/<uuid:batch_id>', batch_detail.batch_detail_handler, name='admin_batch_detail'),
    path('admin/batches/<uuid:batch_id>/students', batch_detail.get_batch_students, name='admin_batch_students'),
    
    # ============================================
    # ADMIN - STUDENT MANAGEMENT (7 endpoints)
    # ============================================
    path('admin/students', students.students_handler, name='admin_students'),
    path('admin/students/<uuid:student_id>', student_detail.student_detail_handler, name='admin_student_detail'),
    path('admin/students/<uuid:student_id>/toggle-active', student_toggle_active.toggle_student_active, name='admin_student_toggle_active'),
    path('admin/students/<uuid:student_id>/reset-password', student_password.reset_student_password, name='admin_student_reset_password'),
    
    # ============================================
    # ADMIN - CLAP TEST MANAGEMENT (10 endpoints)
    # ============================================
    path('admin/clap-tests', clap_tests.clap_tests_handler, name='admin_clap_tests'),
    path('admin/clap-tests/<uuid:test_id>', clap_test_detail.clap_test_detail_handler, name='admin_clap_test_detail'),
    path('admin/clap-tests/<uuid:test_id>/assign', clap_test_assignment.assign_clap_test, name='admin_clap_test_assign'),
    path('admin/clap-tests/<uuid:test_id>/unassign', clap_test_assignment.unassign_clap_test, name='admin_clap_test_unassign'),
    
    # CLAP Test Items (Content)
    path('admin/clap-components/<uuid:component_id>', clap_components.clap_component_detail_handler, name='admin_clap_component_detail'),
    path('admin/clap-components/<uuid:component_id>/items', clap_test_items.clap_test_items_handler, name='admin_clap_test_items'),
    path('admin/clap-items/<uuid:item_id>', clap_test_items.clap_test_item_detail_handler, name='admin_clap_test_item_detail'),
    path('admin/clap-components/<uuid:component_id>/reorder-items', clap_test_items.reorder_items_handler, name='admin_reorder_items'),
    
    # ============================================
    # STUDENT PORTAL (6 endpoints)
    # ============================================
    path('student/profile', profile.student_profile_handler, name='student_profile'),
    path('student/change-password', profile.change_student_password, name='student_change_password'),
    
    # CLAP Test Taking
    path('student/clap-assignments', clap_attempt.list_assigned_tests, name='student_list_assignments'),
    path('student/clap-assignments/<uuid:assignment_id>/components/<uuid:component_id>/items', clap_attempt.student_test_items, name='student_test_items'),
    path('student/clap-assignments/<uuid:assignment_id>/submit', clap_attempt.submit_response, name='student_submit_response'),
    path('student/clap-assignments/<uuid:assignment_id>/components/<uuid:component_id>/finish', clap_attempt.finish_component, name='student_finish_component'),
    
    # ============================================
    # AI EVALUATION (2 endpoints)
    # ============================================
    path('evaluate/speaking', evaluate.evaluate_speaking_test, name='evaluate_speaking'),
    path('evaluate/writing', evaluate.evaluate_writing_test, name='evaluate_writing'),
]

# Total: 23 + 6 = 29 endpoints
