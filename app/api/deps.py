from fastapi import Request, HTTPException
from ..core.security import verify_token

async def get_current_username(request: Request) -> str:
    """
    Extrae y valida el token JWT del header Authorization.
    Lanza HTTPException 401 si falta o es inválido.
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth:
        raise HTTPException(
            status_code=401, 
            detail="Missing authorization header"
        )
    
    if not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401, 
            detail="Invalid authorization format. Expected 'Bearer <token>'"
        )
    
    try:
        # Extraer el token después de "Bearer "
        token = auth[7:].strip()  # Más seguro que split
        
        if not token:
            raise HTTPException(
                status_code=401, 
                detail="Empty token"
            )
        
        username = verify_token(token)
        
        if not username:
            raise HTTPException(
                status_code=401, 
                detail="Invalid or expired token"
            )
        
        return username
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=401, 
            detail=f"Token validation error: {str(e)}"
        )