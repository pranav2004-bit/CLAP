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
    clap_components,
    audio_upload as admin_audio_upload,
    clap_test_results,
    assignment_answers,
    dlq,
    submissions_monitor,
    score_management,
    llm_controls,
    report_management,
    email_management,
    notifications,
    student_bulk_import,
    retest_management,
    clap_test_sets,      # Sets feature
    set_distribution,    # Sets distribution
    timer_management,    # Live timer management
    rescore_mcq,         # MCQ rescore (admin correction tool)
    dashboard_stats,     # Real-time dashboard KPI cards + analytics charts
)
from api.views.student import profile, clap_attempt, audio_upload, audio_playback
from api.views.student import timer_status as student_timer_status
from api.views import evaluate, legacy_tests, legacy_attempts, submissions, email_webhooks, auth
from api.views.health import health_check

app_name = 'api'

urlpatterns = [
    # D5: Public health endpoint (no auth, no rate limit, used by Docker/LB)
    path('health/', health_check, name='health'),
    path('health', health_check, name='health_no_slash'),

    # Auth
    path('auth/login', auth.login, name='auth_login'),
    path('auth/refresh', auth.refresh_token, name='auth_refresh'),

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
    path('admin/students/bulk-import', student_bulk_import.bulk_import_students, name='admin_students_bulk_import'),
    path('admin/students/bulk-template', student_bulk_import.bulk_import_template, name='admin_students_bulk_template'),
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
    path('admin/clap-tests/<uuid:test_id>/results', clap_test_results.clap_test_results_handler, name='admin_clap_test_results'),
    path('admin/clap-tests/<uuid:test_id>/assignments/<uuid:assignment_id>/answers', assignment_answers.assignment_answers, name='admin_assignment_answers'),
    path('admin/clap-tests/<uuid:test_id>/rescore-mcq', rescore_mcq.rescore_mcq, name='admin_rescore_mcq'),
    path('admin/clap-tests/<uuid:test_id>/retest-candidates', retest_management.list_retest_candidates, name='admin_retest_candidates'),
    path('admin/assignments/<uuid:assignment_id>/grant-retest', retest_management.grant_retest, name='admin_grant_retest'),

    # ── Sets Feature (8 endpoints) ──────────────────────────────────────────
    path('admin/clap-tests/<uuid:test_id>/sets', clap_test_sets.sets_handler, name='admin_clap_test_sets'),
    path('admin/clap-tests/<uuid:test_id>/sets/validate', clap_test_sets.validate_sets, name='admin_clap_test_sets_validate'),
    path('admin/clap-tests/<uuid:test_id>/sets/<uuid:set_id>', clap_test_sets.set_detail_handler, name='admin_clap_test_set_detail'),
    path('admin/sets/<uuid:set_id>/components', clap_test_sets.set_components_handler, name='admin_set_components'),
    path('admin/set-components/<uuid:component_id>', clap_test_sets.set_component_detail_handler, name='admin_set_component_detail'),
    path('admin/set-components/<uuid:component_id>/items', clap_test_sets.set_items_handler, name='admin_set_items'),
    path('admin/set-items/<uuid:item_id>', clap_test_sets.set_item_detail_handler, name='admin_set_item_detail'),
    path('admin/set-components/<uuid:component_id>/reorder-items', clap_test_sets.set_reorder_items_handler, name='admin_set_reorder_items'),
    path('admin/clap-tests/<uuid:test_id>/distribute-sets', set_distribution.distribute_sets, name='admin_distribute_sets'),
    path('admin/clap-tests/<uuid:test_id>/distribution-status', set_distribution.distribution_status, name='admin_distribution_status'),
    path('admin/clap-tests/<uuid:test_id>/clear-distribution', set_distribution.clear_distribution, name='admin_clear_distribution'),

    # Timer force-sync (propagates master Configure settings to all set components)
    path('admin/clap-tests/<uuid:test_id>/sync-timers', clap_components.force_sync_timers, name='admin_sync_timers'),

    # ── Live Timer Management (admin controls for real-time deadline changes) ─
    path('admin/clap-tests/<uuid:test_id>/start-live-timer',  timer_management.start_live_timer,  name='admin_start_live_timer'),
    path('admin/clap-tests/<uuid:test_id>/extend-timer',      timer_management.extend_timer,       name='admin_extend_timer'),
    path('admin/clap-tests/<uuid:test_id>/live-timer-status', timer_management.live_timer_status,  name='admin_live_timer_status'),

    # CLAP Test Items (Content)
    path('admin/clap-components/<uuid:component_id>', clap_components.clap_component_detail_handler, name='admin_clap_component_detail'),
    path('admin/clap-components/<uuid:component_id>/items', clap_test_items.clap_test_items_handler, name='admin_clap_test_items'),
    path('admin/clap-items/<uuid:item_id>', clap_test_items.clap_test_item_detail_handler, name='admin_clap_test_item_detail'),
    path('admin/clap-components/<uuid:component_id>/reorder-items', clap_test_items.reorder_items_handler, name='admin_reorder_items'),

    # Audio Block File Upload
    path('admin/clap-items/<uuid:item_id>/upload-audio', admin_audio_upload.upload_audio_file, name='admin_upload_audio'),
    path('admin/clap-items/<uuid:item_id>/audio', admin_audio_upload.handle_audio_file, name='admin_delete_audio'),
    path('admin/set-items/<uuid:item_id>/upload-audio', admin_audio_upload.upload_set_audio_file, name='admin_set_upload_audio'),
    path('admin/set-items/<uuid:item_id>/audio', admin_audio_upload.handle_set_audio_file, name='admin_set_delete_audio'),

    # Submission Pipeline Monitor
    path('admin/submissions/overview', submissions_monitor.submission_status_overview, name='admin_submissions_overview'),
    path('admin/submissions', submissions_monitor.submission_list, name='admin_submissions_list'),
    path('admin/submissions/health', submissions_monitor.pipeline_health, name='admin_submissions_health'),
    # SSE: replaces 15-second polling — server pushes health every 10 s
    path('admin/submissions/health-stream', submissions_monitor.pipeline_health_stream, name='admin_submissions_health_stream'),
    path('admin/submissions/dlq-widget', submissions_monitor.dlq_dashboard_widget, name='admin_submissions_dlq_widget'),
    path('admin/submissions/dlq/<int:dlq_id>/quick-action', submissions_monitor.dlq_quick_action, name='admin_submissions_dlq_quick_action'),
    path('admin/submissions/<uuid:submission_id>', submissions_monitor.submission_detail, name='admin_submissions_detail'),

    path('admin/llm/submissions/<uuid:submission_id>/retrigger', llm_controls.retrigger_llm_evaluation, name='admin_llm_retrigger'),

    path('admin/llm/submissions/<uuid:submission_id>/trace', llm_controls.llm_trace_by_submission, name='admin_llm_trace'),
    path('admin/llm/analytics', llm_controls.llm_analytics, name='admin_llm_analytics'),
    path('admin/llm/dlq/<int:dlq_id>/manual-score', llm_controls.manual_score_from_dlq, name='admin_llm_manual_score_from_dlq'),

    # Report Management
    path('admin/reports', report_management.report_list, name='admin_reports_list'),
    path('admin/reports/submissions/<uuid:submission_id>', report_management.report_by_submission, name='admin_report_submission'),
    path('admin/reports/submissions/<uuid:submission_id>/regenerate', report_management.regenerate_report, name='admin_report_regenerate'),
    path('admin/reports/bulk-download', report_management.bulk_report_download, name='admin_reports_bulk_download'),
    path('admin/reports/template-config', report_management.report_template_config, name='admin_report_template_config'),
    path('admin/reports/template-preview', report_management.report_template_preview, name='admin_report_template_preview'),

    # Email Management
    path('admin/emails/preview', email_management.email_template_preview, name='admin_email_template_preview'),
    path('admin/emails/status', email_management.email_delivery_status, name='admin_email_delivery_status'),
    path('admin/emails/submissions/<uuid:submission_id>/resend', email_management.resend_email, name='admin_email_resend'),
    path('admin/emails/bulk-resend', email_management.bulk_resend_email, name='admin_email_bulk_resend'),
    path('admin/emails/logs', email_management.bounce_complaint_logs, name='admin_email_logs'),

    # Admin Notifications
    path('admin/notifications/alerts', notifications.in_app_alerts, name='admin_notifications_alerts'),
    path('admin/notifications/daily-summary', notifications.send_daily_summary, name='admin_notifications_daily_summary'),

    # Admin Dashboard Stats (real-time KPI + analytics)
    path('admin/stats/dashboard', dashboard_stats.dashboard_stats, name='admin_stats_dashboard'),
    path('admin/stats/analytics', dashboard_stats.analytics_stats, name='admin_stats_analytics'),

    # Score Management
    path('admin/scores/search', score_management.scores_search, name='admin_scores_search'),
    path('admin/scores/submissions/<uuid:submission_id>', score_management.scores_by_submission, name='admin_scores_submission'),
    path('admin/scores/submissions/<uuid:submission_id>/override', score_management.override_score, name='admin_scores_override'),
    path('admin/scores/batches/<uuid:batch_id>', score_management.scores_by_batch, name='admin_scores_batch'),
    path('admin/scores/assessments/<uuid:assessment_id>', score_management.scores_by_assessment, name='admin_scores_assessment'),
    path('admin/scores/export', score_management.export_scores, name='admin_scores_export'),

    # DLQ Management
    path('admin/dlq', dlq.dlq_list, name='admin_dlq_list'),
    path('admin/dlq/bulk-retry', dlq.dlq_bulk_retry, name='admin_dlq_bulk_retry'),
    path('admin/dlq/<int:dlq_id>', dlq.dlq_detail, name='admin_dlq_detail'),
    path('admin/dlq/<int:dlq_id>/retry', dlq.dlq_retry, name='admin_dlq_retry'),
    path('admin/dlq/<int:dlq_id>/resolve', dlq.dlq_resolve, name='admin_dlq_resolve'),

    # ============================================
    # STUDENT PORTAL (6 endpoints)
    # ============================================
    path('student/profile', profile.student_profile_handler, name='student_profile'),
    path('student/change-password', profile.change_student_password, name='student_change_password'),

    # CLAP Test Taking
    path('student/clap-assignments', clap_attempt.list_assigned_tests, name='student_list_assignments'),
    path('student/clap-assignments/<uuid:assignment_id>/start', clap_attempt.start_assignment, name='student_start_assignment'),
    # Live timer — server-authoritative deadline polling (every 5-30 s, adaptive)
    path('student/clap-assignments/<uuid:assignment_id>/global-timer', student_timer_status.global_timer_status, name='student_global_timer'),
    path('student/clap-assignments/<uuid:assignment_id>/components/<uuid:component_id>/items', clap_attempt.student_test_items, name='student_test_items'),
    path('student/clap-assignments/<uuid:assignment_id>/submit', clap_attempt.submit_response, name='student_submit_response'),
    path('student/clap-assignments/<uuid:assignment_id>/components/<uuid:component_id>/finish', clap_attempt.finish_component, name='student_finish_component'),
    # Integrity event logging — fire-and-forget from frontend (tab switch, fullscreen exit, paste)
    path('student/clap-assignments/<uuid:assignment_id>/malpractice-event', clap_attempt.log_malpractice_event, name='student_malpractice_event'),
    # Unified auto-submit: timer expiry, page-unload beacon, malpractice force-submit
    # Idempotent — safe to call multiple times; server Beat task also calls _finalize_and_dispatch directly
    path('student/clap-assignments/<uuid:assignment_id>/auto-submit', clap_attempt.auto_submit_assignment, name='student_auto_submit'),

    # Audio Recording
    path('student/clap-assignments/<uuid:assignment_id>/audio-upload-url', audio_upload.get_audio_upload_url, name='student_audio_upload_url'),
    path('student/clap-assignments/<uuid:assignment_id>/submit-audio', audio_upload.submit_audio_response, name='student_submit_audio'),
    path('student/audio-responses/<uuid:audio_response_id>/file', audio_upload.retrieve_audio_file, name='student_audio_file'),

    # Audio Block Playback
    path('student/clap-items/<uuid:item_id>/audio', audio_playback.retrieve_audio_file, name='student_retrieve_audio'),
    path('student/clap-items/<uuid:item_id>/track-playback', audio_playback.track_playback, name='student_track_playback'),
    path('student/clap-items/<uuid:item_id>/playback-status', audio_playback.get_playback_status, name='student_playback_status'),

    # ============================================
    # SUBMISSION PIPELINE (3 endpoints)
    # ============================================
    path('submissions', submissions.create_submission, name='submissions_create'),
    path('submissions/<uuid:submission_id>/status', submissions.submission_status, name='submissions_status'),
    path('submissions/<uuid:submission_id>/results', submissions.submission_results, name='submissions_results'),
    path('submissions/history', submissions.submission_history, name='submissions_history'),

    # Email webhook events (SES/SendGrid)
    path('email/webhook', email_webhooks.email_event_webhook, name='email_webhook'),

    # ============================================
    # LEGACY / SHARED TESTS (For Dashboard Compatibility)
    # ============================================
    path('tests', legacy_tests.tests_handler, name='legacy_tests_list'),
    path('tests/<uuid:test_id>', legacy_tests.test_detail_handler, name='legacy_test_detail'),
    path('attempts', legacy_attempts.attempts_handler, name='legacy_attempts_list'),

    # ============================================
    # AI EVALUATION (2 endpoints)
    # ============================================
    path('evaluate/speaking', evaluate.evaluate_speaking_test, name='evaluate_speaking'),
    path('evaluate/writing', evaluate.evaluate_writing_test, name='evaluate_writing'),
]

# Total: 23 + 6 + 5 = 34 endpoints (added 5 audio block endpoints)
