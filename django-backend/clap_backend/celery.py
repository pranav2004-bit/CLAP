"""Celery application for CLAP backend."""

import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'clap_backend.settings')

app = Celery('clap_backend')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.conf.broker_connection_retry_on_startup = True  # Silences CPendingDeprecationWarning (Celery 5.x → 6.x)
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
