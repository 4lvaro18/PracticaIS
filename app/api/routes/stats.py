import logging
from fastapi import APIRouter, HTTPException, Request
from ...db.repository import get_stats_db_for_user
from ...core.security import verify_token

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/stats")
async def get_stats(request: Request):
    """Obtiene las estadísticas del usuario autenticado."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    
    token = auth[7:].strip()
    username = verify_token(token)
    
    if not username:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    
    try:
        stats = get_stats_db_for_user(username)
        logger.info(f"Stats recuperadas para {username}: {stats}")
        return stats
    except Exception as e:
        logger.error(f"Error fetching stats for {username}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {str(e)}")