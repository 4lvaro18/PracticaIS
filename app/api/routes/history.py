# app/api/routes/history.py
from fastapi import APIRouter, Request, HTTPException, Depends
from ...db.repository import get_history_db, clear_history_db, add_history_db
from ...api.deps import get_current_username  # dependencia que extrae username desde token

router = APIRouter()

@router.get("/history")
async def get_history(username: str = Depends(get_current_username)):
    """
    Retorna el historial del usuario autenticado.
    """
    try:
        history = get_history_db(username)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching history: {e}")

@router.delete("/history")
async def delete_history(username: str = Depends(get_current_username)):
    """
    Borra TODO el historial del usuario autenticado.
    """
    try:
        clear_history_db(username)
        return {"ok": True, "deleted_for": username}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {e}")
