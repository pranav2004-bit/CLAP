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


@shared_task(bind=True)
def evaluate_speaking(self, submission_id):
    return {'status': 'not_implemented', 'task': 'evaluate_speaking', 'submission_id': submission_id}


@shared_task(bind=True)
def generate_report(self, submission_id):
    return {'status': 'not_implemented', 'task': 'generate_report', 'submission_id': submission_id}


@shared_task(bind=True)
def send_email_report(self, submission_id):
    return {'status': 'not_implemented', 'task': 'send_email_report', 'submission_id': submission_id}
