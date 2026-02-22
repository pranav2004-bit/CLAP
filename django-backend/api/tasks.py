"""Celery tasks for CLAP submission processing pipeline."""

from decimal import Decimal
from typing import Optional

from celery import shared_task
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from api.models import (
    AssessmentSubmission,
    AuditLog,
    ClapTestComponent,
    StudentClapAssignment,
    StudentClapResponse,
    SubmissionScore,
)


def _transition_submission_status(
    submission: AssessmentSubmission,
    new_status: str,
    expected_status: Optional[str] = None,
):
    """Atomic status transition with optimistic lock semantics."""

    qs = AssessmentSubmission.objects.filter(id=submission.id)
    if expected_status:
        qs = qs.filter(status=expected_status)

    updated_rows = qs.update(
        status=new_status,
        version=F('version') + 1,
        updated_at=timezone.now(),
    )

    if updated_rows:
        AuditLog.objects.create(
            submission=submission,
            event_type='status_transition',
            old_status=expected_status or submission.status,
            new_status=new_status,
            worker_id='celery-worker',
        )

    return updated_rows > 0


def _upsert_rule_score(submission: AssessmentSubmission, domain: str, score_value: Decimal):
    SubmissionScore.objects.update_or_create(
        submission=submission,
        domain=domain,
        defaults={
            'score': score_value,
            'feedback_json': None,
            'evaluated_by': 'rule',
            'evaluated_at': timezone.now(),
            'llm_request_id': None,
        },
    )


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=False,
    default_retry_delay=5,
    acks_late=True,
    reject_on_worker_lost=True,
)
def score_rule_based(self, submission_id):
    """Phase A: Compute Listening + Reading + Vocabulary rule-based scores."""

    submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

    # Idempotent short-circuit
    existing_rule_domains = set(
        SubmissionScore.objects.filter(
            submission=submission,
            domain__in=['listening', 'reading', 'vocab'],
        ).values_list('domain', flat=True)
    )

    assignment = StudentClapAssignment.objects.filter(
        student=submission.user,
        clap_test=submission.assessment,
    ).first()

    if not assignment:
        raise ValueError(f'No assignment found for submission {submission_id}')

    component_map = {
        'listening': 'listening',
        'reading': 'reading',
        'vocab': 'vocabulary',
    }

    with transaction.atomic():
        for domain, component_type in component_map.items():
            if domain in existing_rule_domains:
                continue

            component_ids = ClapTestComponent.objects.filter(
                clap_test=submission.assessment,
                test_type=component_type,
            ).values_list('id', flat=True)

            if not component_ids:
                _upsert_rule_score(submission, domain, Decimal('0.00'))
                continue

            marks = (
                StudentClapResponse.objects.filter(
                    assignment=assignment,
                    item__component_id__in=component_ids,
                ).aggregate(total=Sum('marks_awarded'))
            )['total']

            _upsert_rule_score(submission, domain, Decimal(marks or 0).quantize(Decimal('0.01')))

    moved = _transition_submission_status(
        submission,
        AssessmentSubmission.STATUS_RULES_COMPLETE,
        expected_status=AssessmentSubmission.STATUS_PENDING,
    )

    if moved:
        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_LLM_PROCESSING,
            expected_status=AssessmentSubmission.STATUS_RULES_COMPLETE,
        )

    return {
        'status': 'ok',
        'task': 'score_rule_based',
        'submission_id': str(submission.id),
        'domains_scored': ['listening', 'reading', 'vocab'],
    }


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(TimeoutError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def evaluate_writing(self, submission_id):
    return {'status': 'not_implemented', 'task': 'evaluate_writing', 'submission_id': submission_id}


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(TimeoutError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def evaluate_speaking(self, submission_id):
    return {'status': 'not_implemented', 'task': 'evaluate_speaking', 'submission_id': submission_id}


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=False,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
)
def generate_report(self, submission_id):
    return {'status': 'not_implemented', 'task': 'generate_report', 'submission_id': submission_id}


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_email_report(self, submission_id):
    return {'status': 'not_implemented', 'task': 'send_email_report', 'submission_id': submission_id}
