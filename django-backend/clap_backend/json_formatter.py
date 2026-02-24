"""
api/utils/json_formatter.py

Structured JSON log formatter for CLAP backend.

No external dependencies — uses only stdlib json and logging modules.

Output per log record (one JSON object per line):
  {
    "timestamp": "2026-02-24T12:34:56.789Z",
    "level":     "INFO",
    "logger":    "api.tasks",
    "message":   "report_generated",
    "module":    "tasks",
    "lineno":    542,
    "process":   12345,
    "thread":    140234567890,
    "task_id":   "abc-123",        # Celery task ID if present
    "exc_info":  "Traceback ..."   # only on exceptions
  }

Compatible with: CloudWatch Logs, Datadog, Loki, Elasticsearch.
"""

import json
import logging
import traceback
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON objects.

    Usage in settings.LOGGING:
        'formatters': {
            'json': {
                '()': 'api.utils.json_formatter.JsonFormatter',
            },
        },
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            'timestamp': datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).strftime('%Y-%m-%dT%H:%M:%S.') + f'{int(record.msecs):03d}Z',
            'level':   record.levelname,
            'logger':  record.name,
            'message': record.getMessage(),
            'module':  record.module,
            'lineno':  record.lineno,
            'process': record.process,
            'thread':  record.thread,
        }

        # Include Celery task ID if available (set by Celery's log signals)
        task_id = getattr(record, 'task_id', None)
        if task_id:
            payload['task_id'] = task_id

        # Include extra fields attached via logger.info(..., extra={...})
        skip_keys = frozenset({
            'args', 'created', 'exc_info', 'exc_text', 'filename',
            'funcName', 'levelname', 'levelno', 'lineno', 'message',
            'module', 'msecs', 'msg', 'name', 'pathname', 'process',
            'processName', 'relativeCreated', 'stack_info', 'taskName',
            'thread', 'threadName', 'task_id',
        })
        for key, value in record.__dict__.items():
            if key not in skip_keys and not key.startswith('_'):
                try:
                    json.dumps(value)  # only include JSON-serialisable values
                    payload[key] = value
                except (TypeError, ValueError):
                    payload[key] = str(value)

        # Include exception traceback if present
        if record.exc_info:
            payload['exc_info'] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)
