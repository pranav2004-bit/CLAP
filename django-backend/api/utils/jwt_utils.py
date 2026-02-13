import logging
try:
    import jwt
except ImportError:
    jwt = None
from django.conf import settings
from api.models import User

logger = logging.getLogger(__name__)

def get_user_from_request(request):
    """
    Retrieve user from request headers.
    Supports 'x-user-id' (direct ID) and 'Authorization: Bearer <token>' (JWT).
    """
    # 1. Check for explicit user ID (used by frontend in some places)
    user_id = request.headers.get('x-user-id')
    if user_id:
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            logger.warning(f"User not found for x-user-id: {user_id}")
            # Don't return None yet, try token
    
    # 2. Check for Bearer token
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        if jwt is None:
            logger.error("PyJWT is not installed. Cannot decode token.")
            return None
            
        token = auth_header.split(' ')[1]
        try:
            # Decode token - adjust algorithm/key as needed
            # Assuming HS256 and SECRET_KEY for now based on typical Django setup
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            user_id = payload.get('sub') or payload.get('user_id')
            
            if user_id:
                return User.objects.get(id=user_id)
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
        except User.DoesNotExist:
            logger.warning(f"User not found for token payload: {user_id}")
        except Exception as e:
            logger.error(f"Error decoding token: {e}")

    return None
