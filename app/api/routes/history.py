import datetime
import logging
from fastapi import APIRouter, HTTPException, Request
from ...models.schemas import HistoryEntry
from ...db.repository import add_history_db, get_history_db, clear_history_db
from ...core.security import verify_token

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/history")
async def history_get(request: Request):
    """Obtiene el historial del usuario autenticado."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    
    token = auth[7:].strip()
    username = verify_token(token)
    
    if not username:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    
    try:
        history = get_history_db(username)
        logger.info(f"Historia recuperada para {username}: {len(history)} entradas")
        return history
    except Exception as e:
        logger.error(f"Error fetching history for {username}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")


@router.post("/history")
async def history_add(entry: HistoryEntry, request: Request):
    """Añade una entrada al historial."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing token")
    
    token = auth[7:].strip()
    username = verify_token(token)
    
    if not username:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    
    try:
        # Compatibilidad con Pydantic v1 y v2
        if hasattr(entry, "dict"):
            entry_dict = entry.dict()
        else:
            entry_dict = entry.model_dump()
        
        entry_dict["timestamp"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry_dict["username"] = username
        
        add_history_db(entry_dict)
        logger.info(f"Entrada añadida al historial de {username}")
        return {"message": "Entry added to history"}
        
    except Exception as e:
        logger.error(f"Error adding to history for {username}: {e}")
        raise HTTPException(status_code=500, detail=f"Error adding to history: {str(e)}")


@router.delete("/history")
async def history_clear(request: Request):
    """Limpia el historial del usuario."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not auth or not auth.lower().startswith("bearer "):
        logger.warning("DELETE /history sin token de autorización")
        raise HTTPException(status_code=401, detail="missing token")
    
    token = auth[7:].strip()
    username = verify_token(token)
    
    if not username:
        logger.warning(f"DELETE /history con token inválido: {token[:10]}...")
        raise HTTPException(status_code=401, detail="invalid or expired token")
    
    try:
        clear_history_db(username)
        logger.info(f"Historial borrado para usuario {username}")
        return {"message": "History cleared", "user": username}
    except Exception as e:
        logger.error(f"Error clearing history for {username}: {e}")
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")