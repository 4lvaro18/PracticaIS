# app/services/safe_browsing.py
import httpx
import logging
from ..core.config import settings

logger = logging.getLogger(__name__)

async def check_url_google_safe_browsing(url: str) -> dict:
    """
    Consulta Google Safe Browsing API v4.
    NOTA: Solo detecta URLs en la lista negra de Google.
    """
    key = settings.GOOGLE_SAFE_BROWSING_API_KEY
    if not key:
        raise RuntimeError("GOOGLE_SAFE_BROWSING_API_KEY not configured")
    
    endpoint = f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={key}"
    payload = {
        "client": {
            "clientId": "phishguard-local",
            "clientVersion": "1.0"
        },
        "threatInfo": {
            "threatTypes": [
                "MALWARE",
                "SOCIAL_ENGINEERING",
                "POTENTIALLY_HARMFUL_APPLICATION",
                "UNWANTED_SOFTWARE"
            ],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}]
        }
    }
    
    logger.info(f"Consultando Google Safe Browsing para: {url}")
    
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            r = await client.post(endpoint, json=payload)
            
            if r.status_code != 200:
                logger.error(f"Google Safe Browsing error {r.status_code}: {r.text}")
                return {
                    "verdict": "Desconocido",
                    "reason": f"Error de API (código {r.status_code})",
                    "raw": r.text
                }
            
            data = r.json()
            logger.debug(f"Respuesta de Safe Browsing: {data}")
            
            # Si no hay matches, la URL no está en la lista negra
            if not data or "matches" not in data or not data["matches"]:
                logger.info(f"URL no encontrada en listas negras de Google: {url}")
                return {
                    "verdict": "Segura",
                    "reason": "No encontrada en listas negras de Google (NOTA: esto NO garantiza que sea segura)",
                    "raw": data
                }
            
            # Si hay matches, es una amenaza conocida
            reasons = []
            for m in data.get("matches", []):
                threat_type = m.get("threatType", "UNKNOWN")
                platform = m.get("platformType", "")
                entry_type = m.get("threatEntryType", "")
                reasons.append(f"{threat_type} en {platform}")
            
            reason_text = ", ".join(reasons)
            logger.warning(f"⚠️ URL MALICIOSA detectada por Google: {url} - {reason_text}")
            
            return {
                "verdict": "Maliciosa",
                "reason": f"⚠️ Reportada por Google Safe Browsing: {reason_text}",
                "raw": data
            }
            
        except httpx.TimeoutException:
            logger.error(f"Timeout consultando Google Safe Browsing para {url}")
            return {
                "verdict": "Desconocido",
                "reason": "Timeout de conexión",
                "raw": None
            }
        except Exception as e:
            logger.error(f"Error consultando Google Safe Browsing: {e}")
            return {
                "verdict": "Desconocido",
                "reason": f"Error: {str(e)}",
                "raw": None
            }