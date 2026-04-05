"""
Admin Management Views — CRUD for sub_admin accounts.

Only super admins (role='admin') can call these endpoints.
Sub admins (role='sub_admin') are managed exclusively through here.

Default password for new sub admins: CLAP@123
"""

import json
import logging
import uuid

import bcrypt
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import User
from api.utils.auth import require_admin

logger = logging.getLogger(__name__)

_DEFAULT_PASSWORD = "CLAP@123"


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _serialize_admin(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name or "",
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "role": user.role,
        # Default password indicator — frontend shows CLAP@123 as the initial
        # credential hint; after a real reset the backend just re-stores the hash.
        "default_password": _DEFAULT_PASSWORD,
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
def admins_handler(request):
    """
    GET  /api/admin/admins  — list all sub_admin accounts
    POST /api/admin/admins  — create a new sub_admin account
    """
    super_admin, err = require_admin(request)
    if err:
        return err

    # ── LIST ──────────────────────────────────────────────────────────────────
    if request.method == "GET":
        try:
            admins = User.objects.filter(role="sub_admin").order_by("-created_at")
            return JsonResponse({"admins": [_serialize_admin(a) for a in admins]})
        except Exception as exc:
            logger.error("Error listing admins: %s", exc, exc_info=True)
            return JsonResponse({"error": "Failed to list admins"}, status=500)

    # ── CREATE ────────────────────────────────────────────────────────────────
    try:
        body = json.loads(request.body or "{}")
        email = (body.get("email") or "").strip().lower()
        full_name = (body.get("full_name") or "").strip()

        if not email:
            return JsonResponse({"error": "Email is required"}, status=400)

        if User.objects.filter(email__iexact=email, role="sub_admin").exists():
            return JsonResponse({"error": "An admin with this email already exists"}, status=409)

        admin = User.objects.create(
            id=uuid.uuid4(),
            email=email,
            full_name=full_name or email.split("@")[0],
            role="sub_admin",
            password_hash=_hash_password(_DEFAULT_PASSWORD),
            is_active=True,
            profile_completed=True,
        )
        return JsonResponse({"admin": _serialize_admin(admin)}, status=201)

    except Exception as exc:
        logger.error("Error creating admin: %s", exc, exc_info=True)
        return JsonResponse({"error": "Failed to create admin"}, status=500)


@csrf_exempt
@require_http_methods(["PUT", "DELETE"])
def admin_detail_handler(request, admin_id: uuid.UUID):
    """
    PUT    /api/admin/admins/<id>  — update email / full_name
    DELETE /api/admin/admins/<id>  — permanently delete sub_admin account
    """
    super_admin, err = require_admin(request)
    if err:
        return err

    try:
        admin = User.objects.get(id=admin_id, role="sub_admin")
    except User.DoesNotExist:
        return JsonResponse({"error": "Admin not found"}, status=404)

    # ── UPDATE ────────────────────────────────────────────────────────────────
    if request.method == "PUT":
        try:
            body = json.loads(request.body or "{}")
            email = (body.get("email") or "").strip().lower()
            full_name = (body.get("full_name") or "").strip()

            if not email:
                return JsonResponse({"error": "Email is required"}, status=400)

            # Unique-email check (excluding self)
            if (
                User.objects
                .filter(email__iexact=email, role="sub_admin")
                .exclude(id=admin_id)
                .exists()
            ):
                return JsonResponse({"error": "Another admin already uses this email"}, status=409)

            admin.email = email
            if full_name:
                admin.full_name = full_name
            admin.save(update_fields=["email", "full_name"])
            return JsonResponse({"admin": _serialize_admin(admin)})

        except Exception as exc:
            logger.error("Error updating admin %s: %s", admin_id, exc, exc_info=True)
            return JsonResponse({"error": "Failed to update admin"}, status=500)

    # ── DELETE ────────────────────────────────────────────────────────────────
    try:
        admin.delete()
        return JsonResponse({"success": True})
    except Exception as exc:
        logger.error("Error deleting admin %s: %s", admin_id, exc, exc_info=True)
        return JsonResponse({"error": "Failed to delete admin"}, status=500)


@csrf_exempt
@require_http_methods(["PATCH"])
def admin_toggle_active(request, admin_id: uuid.UUID):
    """
    PATCH /api/admin/admins/<id>/toggle  — enable or disable a sub_admin account
    """
    super_admin, err = require_admin(request)
    if err:
        return err

    try:
        admin = User.objects.get(id=admin_id, role="sub_admin")
    except User.DoesNotExist:
        return JsonResponse({"error": "Admin not found"}, status=404)

    try:
        admin.is_active = not admin.is_active
        admin.save(update_fields=["is_active"])
        return JsonResponse({"admin": _serialize_admin(admin)})
    except Exception as exc:
        logger.error("Error toggling admin %s: %s", admin_id, exc, exc_info=True)
        return JsonResponse({"error": "Failed to toggle admin status"}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def admin_reset_password(request, admin_id: uuid.UUID):
    """
    POST /api/admin/admins/<id>/reset-password  — reset sub_admin password to CLAP@123
    """
    super_admin, err = require_admin(request)
    if err:
        return err

    try:
        admin = User.objects.get(id=admin_id, role="sub_admin")
    except User.DoesNotExist:
        return JsonResponse({"error": "Admin not found"}, status=404)

    try:
        admin.password_hash = _hash_password(_DEFAULT_PASSWORD)
        admin.save(update_fields=["password_hash"])
        return JsonResponse({"success": True, "message": f"Password reset to {_DEFAULT_PASSWORD}"})
    except Exception as exc:
        logger.error("Error resetting password for admin %s: %s", admin_id, exc, exc_info=True)
        return JsonResponse({"error": "Failed to reset password"}, status=500)
