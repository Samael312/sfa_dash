from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
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
    username: str
    password: str

class RegisterBody(BaseModel):
    username: str
    name: str  # Corregido: antes decía EmailStr
    surname: str   
    email: EmailStr
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
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Agregamos 'name' a la consulta
            cur.execute(
                "SELECT id, email, username, password_hash, name FROM users WHERE username = %s",
                (body.username.lower().strip(),),
            )
            row = cur.fetchone()
    finally:
        release_conn(conn)

    if not row or not verify_password(body.password[:72], row[3]):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

    # Ahora row[4] sí existe y contiene el nombre
    token = create_access_token({"sub": str(row[0]), "email": row[1], "username": row[2], "name": row[4]})
    return {"access_token": token, "token_type": "bearer", "username": row[2], "email": row[1], "name": row[4]}


@router.post("/register", status_code=201)
def register(data: RegisterBody): # Usamos RegisterBody definido arriba
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 1. Verificar duplicados
            cur.execute("SELECT id FROM users WHERE email = %s OR username = %s", 
                        (data.email.lower().strip(), data.username.strip()))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="El email o usuario ya están registrados.")

            # 2. Crear usuario
            hashed = hash_password(data.password[:72])
            cur.execute(
                """INSERT INTO users (email, username, name, surname, password_hash) 
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (data.email.lower().strip(), data.username.strip(), data.name.strip(), 
                 data.surname.strip(), hashed),
            )
            user_id = cur.fetchone()[0]
        
        conn.commit()

        # 3. Respuesta
        token = create_access_token({"sub": str(user_id), "email": data.email, "username": data.username})
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": data.username,
            "email": data.email
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        release_conn(conn)


@router.post("/forgot-password")
def endpoint_forgot_password(body: ForgotBody):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (body.email.lower().strip(),))
            row = cur.fetchone()
            if not row:
                return {"message": "Si el email existe, se ha generado un código.", "reset_token": None}

            reset_token = generate_reset_token()
            expires = datetime.now(timezone.utc) + timedelta(hours=1)
            cur.execute("UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s",
                        (reset_token, expires, row[0]))
        conn.commit()
    finally:
        release_conn(conn)
    return {"message": "Código generado.", "reset_token": reset_token}


@router.post("/reset-password")
def endpoint_reset_password(body: ResetBody):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="Mínimo 6 caracteres.")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, reset_token_expires FROM users WHERE reset_token = %s", (body.token,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="Código inválido.")

            user_id, expires = row
            if expires.tzinfo is None: expires = expires.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                raise HTTPException(status_code=400, detail="El código ha expirado.")

            hashed = hash_password(body.new_password[:72])
            cur.execute("UPDATE users SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL WHERE id = %s",
                        (hashed, user_id))
        conn.commit()
    finally:
        release_conn(conn)
    return {"message": "Contraseña actualizada."}