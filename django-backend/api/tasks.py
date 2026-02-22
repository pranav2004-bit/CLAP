"""Celery tasks for CLAP submission processing pipeline."""

from decimal import Decimal
from typing import Optional
import json
import re
from urllib import request as urlrequest

from celery import shared_task
from django.conf import settings

from celery import shared_task
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from api.models import (
    AssessmentSubmission,
    AuditLog,
    ClapTestComponent,
    StudentAudioResponse,
    StudentClapAssignment,
    StudentClapResponse,
    SubmissionScore,
)
from api.utils.openai_client import evaluate_speaking as openai_evaluate_speaking
from api.utils.openai_client import evaluate_writing as openai_evaluate_writing


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


def _extract_json(raw_text: str):
    try:
        return json.loads(raw_text)
    except Exception:
        pass

    cleaned = raw_text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\n?', '', cleaned)
        cleaned = re.sub(r'\n?```$', '', cleaned)
    return json.loads(cleaned)


def _semantic_guard(score: float, feedback: dict):
    fb_text = json.dumps(feedback).lower()
    if score >= 8 and ('poor' in fb_text or 'very weak' in fb_text):
        return False
    if score <= 3 and ('excellent' in fb_text or 'outstanding' in fb_text):
        return False
    return True


def _gemini_generate_json(prompt: str):
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError('GEMINI_API_KEY is not configured')

    model = settings.GEMINI_MODEL
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'temperature': 0.2, 'responseMimeType': 'application/json'},
    }
    req = urlrequest.Request(
        endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urlrequest.urlopen(req, timeout=120) as resp:
        raw = json.loads(resp.read().decode('utf-8'))
    text = raw['candidates'][0]['content']['parts'][0]['text']
    return _extract_json(text)


def _evaluate_writing_payload(essay: str, prompt: str):
    provider = settings.LLM_PROVIDER.lower()
    if provider == 'gemini':
        return _gemini_generate_json(f'Prompt: {prompt}\nEssay: {essay}\nReturn JSON with score(0-10) and feedback object.')

    result = openai_evaluate_writing(essay=essay, prompt=prompt)
    return {
        'score': float(result.get('score', 0)),
        'feedback': {
            'overall': result.get('feedback', ''),
            'breakdown': result.get('breakdown', {}),
        },
    }


def _evaluate_speaking_payload(transcript: str, prompt: str):
    provider = settings.LLM_PROVIDER.lower()
    if provider == 'gemini':
        return _gemini_generate_json(f'Prompt: {prompt}\nTranscript: {transcript}\nReturn JSON with score(0-10) and feedback object.')

    result = openai_evaluate_speaking(transcript=transcript, prompt=prompt)
    return {
        'score': float(result.get('score', 0)),
        'feedback': {
            'overall': result.get('feedback', ''),
            'breakdown': result.get('breakdown', {}),
        },
    }


def _persist_llm_score(submission: AssessmentSubmission, domain: str, payload: dict):
    score = float(payload.get('score', 0))
    if not (0 <= score <= 10):
        raise ValueError('LLM score out of range 0-10')

    feedback = payload.get('feedback', {}) or {}
    if not isinstance(feedback, dict):
        raise ValueError('LLM feedback must be object')

    # Semantic guard
    guarded = _semantic_guard(score, feedback)
    if not guarded:
        feedback['semantic_warning'] = 'Potential contradiction detected'

    SubmissionScore.objects.update_or_create(
        submission=submission,
        domain=domain,
        defaults={
            'score': Decimal(str(round(score, 2))),
            'feedback_json': feedback,
            'evaluated_by': 'llm',
            'evaluated_at': timezone.now(),
            'llm_request_id': f"{settings.LLM_PROVIDER}-{timezone.now().timestamp()}",
        },
    )


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=False, default_retry_delay=5, acks_late=True, reject_on_worker_lost=True)
def score_rule_based(self, submission_id):
    submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

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

    assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
    if not assignment:
        raise ValueError(f'No assignment found for submission {submission_id}')

    component_map = {'listening': 'listening', 'reading': 'reading', 'vocab': 'vocabulary'}
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
            component_ids = ClapTestComponent.objects.filter(clap_test=submission.assessment, test_type=component_type).values_list('id', flat=True)
            if not component_ids:
                _upsert_rule_score(submission, domain, Decimal('0.00'))
                continue
            marks = StudentClapResponse.objects.filter(assignment=assignment, item__component_id__in=component_ids).aggregate(total=Sum('marks_awarded'))['total']
            _upsert_rule_score(submission, domain, Decimal(marks or 0).quantize(Decimal('0.01')))

    moved = _transition_submission_status(submission, AssessmentSubmission.STATUS_RULES_COMPLETE, expected_status=AssessmentSubmission.STATUS_PENDING)
    if moved:
        _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_PROCESSING, expected_status=AssessmentSubmission.STATUS_RULES_COMPLETE)

    return {'status': 'ok', 'task': 'score_rule_based', 'submission_id': str(submission.id), 'domains_scored': ['listening', 'reading', 'vocab']}


@shared_task(bind=True, max_retries=3, autoretry_for=(TimeoutError, ConnectionError, ValueError), retry_backoff=True, retry_backoff_max=300, retry_jitter=True, acks_late=True, reject_on_worker_lost=True)
def evaluate_writing(self, submission_id):
    submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

    if SubmissionScore.objects.filter(submission=submission, domain='writing').exists():
        return {'status': 'skipped', 'reason': 'writing score already exists', 'submission_id': submission_id}

    assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
    response = StudentClapResponse.objects.filter(assignment=assignment, item__component__test_type='writing').order_by('-updated_at').first()

    essay = ''
    if response and response.response_data is not None:
        essay = response.response_data if isinstance(response.response_data, str) else json.dumps(response.response_data)

    payload = _evaluate_writing_payload(essay=essay, prompt='Evaluate writing response using rubric and return JSON')
    _persist_llm_score(submission, 'writing', payload)
    return {'status': 'ok', 'task': 'evaluate_writing', 'submission_id': submission_id}


@shared_task(bind=True, max_retries=3, autoretry_for=(TimeoutError, ConnectionError, ValueError), retry_backoff=True, retry_backoff_max=300, retry_jitter=True, acks_late=True, reject_on_worker_lost=True)
def evaluate_speaking(self, submission_id):
    submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

    if SubmissionScore.objects.filter(submission=submission, domain='speaking').exists():
        return {'status': 'skipped', 'reason': 'speaking score already exists', 'submission_id': submission_id}

    assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
    audio = StudentAudioResponse.objects.filter(assignment=assignment, item__component__test_type='speaking').order_by('-uploaded_at').first()
    transcript = (audio.transcription or '') if audio else ''

    payload = _evaluate_speaking_payload(transcript=transcript, prompt='Evaluate speaking transcript using rubric and return JSON')
    _persist_llm_score(submission, 'speaking', payload)

    if SubmissionScore.objects.filter(submission=submission, domain='writing').exists():
        _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_COMPLETE, expected_status=AssessmentSubmission.STATUS_LLM_PROCESSING)

    return {'status': 'ok', 'task': 'evaluate_speaking', 'submission_id': submission_id}


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=False, default_retry_delay=30, acks_late=True, reject_on_worker_lost=True)

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
"""Celery task stubs for CLAP submission processing pipeline.

These tasks are placeholders to establish queue routing and worker startup
for the Phase 1 infrastructure milestone.
"""

from celery import shared_task


@shared_task(bind=True)
def score_rule_based(self, submission_id):
    return {'status': 'not_implemented', 'task': 'score_rule_based', 'submission_id': submission_id}


@shared_task(bind=True)
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
@shared_task(bind=True)
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
@shared_task(bind=True)
def generate_report(self, submission_id):
    return {'status': 'not_implemented', 'task': 'generate_report', 'submission_id': submission_id}


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=900, retry_jitter=True, acks_late=True, reject_on_worker_lost=True)
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
@shared_task(bind=True)
def send_email_report(self, submission_id):
    return {'status': 'not_implemented', 'task': 'send_email_report', 'submission_id': submission_id}
