"""
Authentication Views
Backend-only login endpoint for frontend auth.
"""

import json
import logging
import bcrypt
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import User

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def login(request):
    """
    POST /api/auth/login
    Body: { identifier, password, role }
    """
    try:
        body = json.loads(request.body or "{}")
        identifier = (body.get("identifier") or "").strip()
        password = body.get("password") or ""
        role = (body.get("role") or "student").strip()

        if not identifier or not password:
            return JsonResponse({"error": "Missing identifier or password"}, status=400)

        if role not in ("student", "admin"):
            return JsonResponse({"error": "Invalid role"}, status=400)

        query = User.objects.filter(role=role)
        if role == "student":
            query = query.filter(
                Q(email__iexact=identifier) |
                Q(username__iexact=identifier) |
                Q(student_id__iexact=identifier)
            )
        else:
            query = query.filter(email__iexact=identifier)

        user = query.first()
        if not user:
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        if not user.is_active:
            return JsonResponse({"error": "This account is disabled by admin"}, status=403)

        try:
            valid = bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8"))
        except Exception as exc:
            logger.error("Password verification failed: %s", exc)
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        if not valid:
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        return JsonResponse({
            "user": {
                "id": str(user.id),
                "email": user.email,
                "role": user.role,
                "full_name": user.full_name,
                "profile_completed": user.profile_completed,
                "student_id": user.student_id,
            }
        })
    except Exception as exc:
        logger.error("Login error: %s", exc, exc_info=True)
        return JsonResponse({"error": "Authentication failed"}, status=500)
