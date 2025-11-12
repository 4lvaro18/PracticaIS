import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from ...api.deps import get_current_username
from ...models.schemas import HistoryEntry
from ...db.repository import add_history_db, get_history_db, clear_history_db

router = APIRouter()


@router.get("/history")
async def history_get(username: str = Depends(get_current_username)):
    """Obtiene el historial del usuario autenticado."""
    try:
        return get_history_db(username)
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error fetching history: {str(e)}"
        )


@router.post("/history")
async def history_add(
    entry: HistoryEntry, 
    username: str = Depends(get_current_username)
):
    """Añade una entrada al historial."""
    try:
        # Compatibilidad con Pydantic v1 y v2
        if hasattr(entry, "dict"):
            entry_dict = entry.dict()
        else:
            entry_dict = entry.model_dump()
        
        entry_dict["timestamp"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry_dict["username"] = username
        
        add_history_db(entry_dict)
        return {"message": "Entry added to history"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error adding to history: {str(e)}"
        )


@router.delete("/history")
async def history_clear(username: str = Depends(get_current_username)):
    """Limpia el historial del usuario."""
    try:
        clear_history_db(username)
        return {"message": "History cleared"}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error clearing history: {str(e)}"
        )