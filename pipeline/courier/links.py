"""Signed links the delivery job puts in emails. web/lib/server/read-link.ts and check-in.ts verify
them with the same secret (READ_LINK_SECRET), so the two sides must build tokens identically."""

import base64
import hashlib
import hmac
import uuid

MAC_BYTES = 18


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _token(secret: str, user_id: str, message: str) -> str:
    mac = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()[:MAC_BYTES]
    return _b64(uuid.UUID(user_id).bytes) + _b64(mac)


def read_link(app_url: str, secret: str, user_id: str, version: int) -> str:
    return f"{app_url}/read/{_token(secret, user_id, f'read-link:{user_id}:{version}')}"


def check_in_token(secret: str, user_id: str) -> str:
    return _token(secret, user_id, f"check-in:{user_id}")
