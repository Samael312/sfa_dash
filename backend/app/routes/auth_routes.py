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
    name: str  
    surname: str   
    email: EmailStr
    password: str

class ForgotBody(BaseModel):
    email: str

class ResetBody(BaseModel):
    email: str
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
            # Solo comprobamos si el email existe
            cur.execute("SELECT id FROM users WHERE email = %s", (body.email.lower().strip(),))
            row = cur.fetchone()
            if not row:
                # Lanzamos un 404 para que el frontend capture el error
                raise HTTPException(status_code=404, detail="No existe una cuenta con este correo.")
            
            # Ya no generamos ni guardamos ningún reset_token
    finally:
        release_conn(conn)
        
    return {"message": "Email verificado correctamente."}


@router.post("/reset-password")
def endpoint_reset_password(body: ResetBody):
    if len(body.new_password) < 4:
        raise HTTPException(status_code=422, detail="La contraseña debe tener mínimo 4 caracteres.")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Buscamos al usuario directamente por su email
            cur.execute("SELECT id FROM users WHERE email = %s", (body.email.lower().strip(),))
            row = cur.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Usuario no encontrado.")

            user_id = row[0]
            hashed = hash_password(body.new_password[:72])
            
            # Actualizamos la contraseña. (Si tenías columnas de token en la BD, puedes limpiarlas por si acaso)
            cur.execute("""
                UPDATE users 
                SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL 
                WHERE id = %s
            """, (hashed, user_id))
            
        conn.commit()
    finally:
        release_conn(conn)
        
    return {"message": "Contraseña actualizada con éxito."}