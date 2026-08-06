import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional, Dict, Any

SECRET_KEY = os.getenv("JWT_SECRET", "airide-super-secret-jwt-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_SECONDS = 86400 * 7  # 7 days

def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _b64_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode((data + padding).encode('utf-8'))

def create_access_token(data: dict, expires_delta: Optional[int] = None) -> str:
    to_encode = data.copy()
    now = int(time.time())
    expire = now + (expires_delta if expires_delta is not None else ACCESS_TOKEN_EXPIRE_SECONDS)
    
    header = {"alg": ALGORITHM, "typ": "JWT"}
    payload = {**to_encode, "iat": now, "exp": expire}

    header_bytes = json.dumps(header, separators=(',', ':')).encode('utf-8')
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')

    unsigned_token = f"{_b64_encode(header_bytes)}.{_b64_encode(payload_bytes)}"
    signature = hmac.new(
        SECRET_KEY.encode('utf-8'),
        unsigned_token.encode('utf-8'),
        hashlib.sha256
    ).digest()

    return f"{unsigned_token}.{_b64_encode(signature)}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        unsigned_token = f"{header_b64}.{payload_b64}"
        expected_sig = hmac.new(
            SECRET_KEY.encode('utf-8'),
            unsigned_token.encode('utf-8'),
            hashlib.sha256
        ).digest()

        if not hmac.compare_digest(_b64_encode(expected_sig), sig_b64):
            return None

        payload = json.loads(_b64_decode(payload_b64).decode('utf-8'))
        if int(time.time()) > payload.get("exp", 0):
            return None

        return payload
    except Exception as e:
        print(f"[JWT] Token decode error: {e}")
        return None
