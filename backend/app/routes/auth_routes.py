"""
routes/auth_routes.py
---------------------
Endpoints de autenticación:

  POST /internal/dashboard/auth/login
  POST /internal/dashboard/auth/register
  POST /internal/dashboard/auth/forgot-password
  POST /internal/dashboard/auth/reset-password

Migración SQL necesaria (ejecutar una sola vez):
─────────────────────────────────────────────────
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
─────────────────────────────────────────────────

Asegúrate de que la tabla users tiene al menos:
  id SERIAL PRIMARY KEY
  email VARCHAR(255) UNIQUE NOT NULL
  name  VARCHAR(255) NOT NULL
  password_hash VARCHAR(255) NOT NULL
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import (
    create_access_token,
    generate_reset_token,
    hash_password,
    verify_password,
)
from app.config.db import get_conn, release_conn

router = APIRouter(prefix="/internal/dashboard/auth", tags=["auth"])


# ==========================================
# SCHEMAS
# ==========================================
class LoginBody(BaseModel):
    email: str
    password: str


class RegisterBody(BaseModel):
    name: str
    email: str
    password: str


class ForgotBody(BaseModel):
    email: str


class ResetBody(BaseModel):
    token: str
    new_password: str


# ==========================================
# ENDPOINTS
# ==========================================
@router.post("/login")
def endpoint_login(body: LoginBody):
    """Autentica al usuario y devuelve un JWT."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, password_hash FROM users WHERE email = %s",
                (body.email.lower().strip(),),
            )
            row = cur.fetchone()
    finally:
        release_conn(conn)

    if not row or not verify_password(body.password, row[3]):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")

    token = create_access_token({"sub": str(row[0]), "email": row[1], "name": row[2]})
    return {"access_token": token, "token_type": "bearer", "name": row[2], "email": row[1]}


@router.post("/register", status_code=201)
def endpoint_register(body: RegisterBody):
    """Crea una nueva cuenta y devuelve el JWT (auto-login)."""
    if len(body.password) < 6:
        raise HTTPException(
            status_code=422, detail="La contraseña debe tener al menos 6 caracteres."
        )
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                (body.email.lower().strip(),),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="Este email ya está registrado."
                )

            hashed = hash_password(body.password)
            cur.execute(
                "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s) RETURNING id",
                (body.email.lower().strip(), body.name.strip(), hashed),
            )
            user_id = cur.fetchone()[0]
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        release_conn(conn)

    token = create_access_token(
        {"sub": str(user_id), "email": body.email.lower().strip(), "name": body.name.strip()}
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "name": body.name.strip(),
        "email": body.email.lower().strip(),
    }


@router.post("/forgot-password")
def endpoint_forgot_password(body: ForgotBody):
    """
    Genera un token de recuperación (válido 1 hora).
    En producción se enviaría por email; aquí se devuelve en la respuesta como demo.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                (body.email.lower().strip(),),
            )
            row = cur.fetchone()

        # No revelar si el email existe o no (seguridad)
        if not row:
            return {
                "message": "Si el email existe, se ha generado un código de recuperación.",
                "reset_token": None,
            }

        reset_token = generate_reset_token()
        expires = datetime.now(timezone.utc) + timedelta(hours=1)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
                (reset_token, expires, row[0]),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        release_conn(conn)

    return {
        "message": "Código generado. En producción se enviaría por email.",
        "reset_token": reset_token,
        "expires_in_minutes": 60,
    }


@router.post("/reset-password")
def endpoint_reset_password(body: ResetBody):
    """Valida el token y actualiza la contraseña."""
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=422, detail="La contraseña debe tener al menos 6 caracteres."
        )

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, reset_token_expires FROM users WHERE reset_token = %s",
                (body.token,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(
                status_code=400, detail="Código inválido o ya utilizado."
            )

        user_id, expires = row
        # Normalizar timezone
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(
                status_code=400, detail="El código ha expirado. Solicita uno nuevo."
            )

        hashed = hash_password(body.new_password)
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE users
                   SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL
                   WHERE id = %s""",
                (hashed, user_id),
            )
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        release_conn(conn)

    return {"message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."}