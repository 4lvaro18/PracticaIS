from fastapi import APIRouter, HTTPException, Request
from ...models.schemas import Credentials
from ...core.security import (
    create_user, 
    create_session, 
    verify_password, 
    delete_session,
    verify_token
)
from ...db.database import get_db_conn
from ...db.repository import clear_history_db

router = APIRouter()


@router.post("/signup")
async def signup(creds: Credentials):
    """Crea una nueva cuenta de usuario."""
    if not creds.username or not creds.password:
        raise HTTPException(
            status_code=400, 
            detail="username and password required"
        )
    
    ok = create_user(creds.username, creds.password)
    if not ok:
        raise HTTPException(
            status_code=400, 
            detail="username already exists"
        )
    
    return {"message": "user created"}


@router.post("/login")
async def login(creds: Credentials):
    """Inicia sesión y devuelve un token JWT."""
    if not creds.username or not creds.password:
        raise HTTPException(
            status_code=400, 
            detail="username and password required"
        )
    
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT password_hash, salt FROM users WHERE username=?", 
        (creds.username,)
    )
    r = cur.fetchone()
    conn.close()
    
    if not r:
        raise HTTPException(
            status_code=401, 
            detail="invalid credentials"
        )
    
    if not verify_password(creds.password, r["password_hash"], r["salt"]):
        raise HTTPException(
            status_code=401, 
            detail="invalid credentials"
        )
    
    token = create_session(creds.username)
    return {"token": token, "username": creds.username}


@router.post("/logout")
async def logout(request: Request):
    """Cierra sesión eliminando el token."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401, 
            detail="missing token"
        )
    
    try:
        token = auth[7:].strip()
        delete_session(token)
        return {"message": "logged out"}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Logout error: {str(e)}"
        )


@router.post("/reset_stats")
async def reset_stats(request: Request):
    """Resetea las estadísticas del usuario (limpia su historial)."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401, 
            detail="missing token"
        )
    
    try:
        token = auth[7:].strip()
        username = verify_token(token)
        
        if not username:
            raise HTTPException(
                status_code=401, 
                detail="invalid or expired token"
            )
        
        clear_history_db(username)
        return {"message": "stats reset (history cleared for user)"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Reset error: {str(e)}"
        )