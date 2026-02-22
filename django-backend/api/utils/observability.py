import json
import logging
from datetime import datetime, timezone


logger = logging.getLogger('api.observability')


def log_event(level: str, event: str, **fields):
    payload = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'level': level.upper(),
        'event': event,
        **fields,
    }
    message = json.dumps(payload, default=str)
    lvl = level.lower()
    if lvl == 'debug':
        logger.debug(message)
    elif lvl == 'warning':
        logger.warning(message)
    elif lvl == 'error':
        logger.error(message)
    else:
        logger.info(message)
