"""
auth.py
-------
Utilidades de autenticación: hashing de contraseñas y JWT.

Dependencias pip:
  pip install "python-jose[cryptography]" "passlib[bcrypt]"
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt


SECRET_KEY = os.getenv("SECRET_KEY", "akssak-ak23j4h5k6l7m8n9o0p1q2r3s4t5u6v7w8x9y0z")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

import bcrypt

def hash_password(password: str) -> str:
    # El hash debe ser bytes, se convierte a utf-8
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')
    hash_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(pwd_bytes, hash_bytes)


def create_access_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)