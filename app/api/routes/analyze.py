# app/api/routes/analyze.py
import datetime
import logging
from fastapi import APIRouter, HTTPException, Depends

from ...models.schemas import AnalyzeRequest, AnalyzeUrlRequest
from ...api.deps import get_current_username
from ...db.repository import add_history_db
from ...core.config import settings

from ...services.scoring import score_text, score_url
from ...services.safe_browsing import check_url_google_safe_browsing
from ...services.gemini_client import analyze_text as gemini_analyze_text, analyze_url as gemini_analyze_url

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/analyze")
async def analyze_text_route(request: AnalyzeRequest, username: str = Depends(get_current_username)):
    """
    Analiza TEXTO:
      1) Intenta Gemini (si está configurado)
      2) Fallback a heurística local
    Registra el resultado en la tabla 'history'.
    """
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vacío")

    verdict: str
    percentage: int
    reasons: list
    url_results: list

    # 1) Intento con Gemini (si hay configuración)
    try:
        result = await gemini_analyze_text(
            text,
            gemini_key=settings.GEMINI_API_KEY,
            gemini_url=settings.GEMINI_API_URL
        )
        verdict = result.get("verdict", "Sospechoso")
        try:
            percentage = int(result.get("percentage", 0))
        except Exception:
            percentage = 0
        reasons = result.get("reasons", []) or []
        url_results = result.get("url_results", []) or []
    except RuntimeError:
        # Gemini no configurado → heurística local
        local = score_text(text)
        verdict = local["verdict"]
        percentage = int(local["percentage"])
        reasons = local["reasons"]
        url_results = local["url_results"]
    except Exception as e:
        # Error en la llamada a Gemini → heurística local
        logger.warning(f"Error llamando a Gemini analyze_text: {e}")
        local = score_text(text)
        verdict = local["verdict"]
        percentage = int(local["percentage"])
        reasons = [f"Fallback local por error de proveedor: {e}"] + local["reasons"]
        url_results = local["url_results"]

    # Guardar en historial
    entry = {
        "username": username,
        "type": "texto",
        "input": text,
        "verdict": verdict,
        "percentage": percentage,
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    add_history_db(entry)

    return {
        "combined_verdict": verdict,
        "percentage": percentage,
        "url_results": [{"url": u.get("url"), "verdict": u.get("verdict"), "reason": u.get("reason")}
                        for u in (url_results or [])],
        "reasons": reasons,
    }


@router.post("/analyze_url")
async def analyze_url_route(request: AnalyzeUrlRequest, username: str = Depends(get_current_username)):
    """
    Analiza una URL usando MÚLTIPLES métodos y combina los resultados:
      1) Heurística local (siempre)
      2) Google Safe Browsing (si está configurado)
      3) Gemini AI (si está configurado)
    
    Combina los veredictos con un sistema de puntuación para mayor precisión.
    """
    url = (request.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL vacía")

    # Resultados de cada método
    results = {
        "heuristic": None,
        "safe_browsing": None,
        "gemini": None
    }
    
    # 1) SIEMPRE ejecutar heurística local
    try:
        local = score_url(url)
        results["heuristic"] = {
            "verdict": local["verdict"],
            "score": local["score"],
            "reason": local["reason"]
        }
        logger.info(f"Heurística local para {url}: {local['verdict']} ({local['score']}%)")
    except Exception as e:
        logger.error(f"Error en heurística local: {e}")

    # 2) Intentar Google Safe Browsing (si está configurado)
    if settings.GOOGLE_SAFE_BROWSING_API_KEY:
        try:
            gsb = await check_url_google_safe_browsing(url)
            results["safe_browsing"] = {
                "verdict": gsb.get("verdict", "Desconocido"),
                "reason": gsb.get("reason", "")
            }
            logger.info(f"Google Safe Browsing para {url}: {gsb.get('verdict')}")
        except RuntimeError as e:
            logger.warning(f"Google Safe Browsing no configurado: {e}")
        except Exception as e:
            logger.error(f"Error llamando a Google Safe Browsing: {e}")

    # 3) Intentar Gemini (si está configurado)
    if settings.GEMINI_API_KEY and settings.GEMINI_API_URL:
        try:
            g = await gemini_analyze_url(
                url,
                gemini_key=settings.GEMINI_API_KEY,
                gemini_url=settings.GEMINI_API_URL
            )
            results["gemini"] = {
                "verdict": g.get("verdict", "Desconocido"),
                "reason": g.get("reason", ""),
                "score": g.get("score", 50)
            }
            logger.info(f"Gemini AI para {url}: {g.get('verdict')}")
        except Exception as e:
            logger.error(f"Error llamando a Gemini analyze_url: {e}")

    # 4) COMBINAR RESULTADOS con sistema de puntuación
    final_verdict, final_reason = _combine_url_verdicts(results, url)

    # Guardar en historial
    entry = {
        "username": username,
        "type": "url",
        "input": url,
        "verdict": final_verdict,
        "percentage": None,
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    add_history_db(entry)

    # Respuesta con detalles de cada método
    return {
        "verdict": final_verdict,
        "reason": final_reason,
        "details": {
            "heuristic": results["heuristic"],
            "safe_browsing": results["safe_browsing"],
            "gemini": results["gemini"]
        },
        "provider_tried": {
            "heuristic": results["heuristic"] is not None,
            "gemini": results["gemini"] is not None,
            "google_safe_browsing": results["safe_browsing"] is not None
        }
    }


def _combine_url_verdicts(results: dict, url: str) -> tuple[str, str]:
    """
    Combina los veredictos de múltiples fuentes usando un sistema de votación ponderado.
    
    Pesos:
    - Heurística local: 1
    - Google Safe Browsing: 3 (muy confiable para amenazas conocidas)
    - Gemini: 2 (IA general)
    
    Returns:
        (verdict, reason) tuple
    """
    scores = {
        "Segura": 0,
        "Sospechosa": 0,
        "Maliciosa": 0
    }
    
    reasons = []
    
    # Heurística local (peso 1)
    if results["heuristic"]:
        h = results["heuristic"]
        verdict = h["verdict"]
        scores[verdict] += 1
        reasons.append(f"Heurística: {verdict} - {h['reason']}")
    
    # Google Safe Browsing (peso 3 - muy confiable)
    if results["safe_browsing"]:
        sb = results["safe_browsing"]
        verdict = sb["verdict"]
        
        if verdict == "Maliciosa":
            # Si Safe Browsing dice que es maliciosa, casi seguro lo es
            scores["Maliciosa"] += 5  # Peso muy alto
            reasons.append(f"⚠️ Google Safe Browsing: {sb['reason']}")
        elif verdict == "Segura":
            # Pero "segura" solo significa "no está en la lista negra"
            scores["Segura"] += 1  # Peso bajo
            reasons.append("Safe Browsing: No encontrada en listas negras conocidas")
    
    # Gemini (peso 2)
    if results["gemini"]:
        g = results["gemini"]
        verdict = g["verdict"]
        score = g.get("score", 50)
        
        # Convertir score a veredicto si es necesario
        if verdict not in scores:
            if score > 60:
                verdict = "Maliciosa"
            elif score > 30:
                verdict = "Sospechosa"
            else:
                verdict = "Segura"
        
        scores[verdict] += 2
        reasons.append(f"Gemini AI: {verdict} - {g['reason']}")
    
    # Determinar veredicto final
    if scores["Maliciosa"] >= 2:  # Al menos 2 puntos hacia maliciosa
        final_verdict = "Maliciosa"
    elif scores["Sospechosa"] >= 2 or (scores["Maliciosa"] > 0 and scores["Segura"] > 0):
        final_verdict = "Sospechosa"
    elif scores["Segura"] > scores["Maliciosa"] + scores["Sospechosa"]:
        final_verdict = "Segura"
    else:
        final_verdict = "Sospechosa"  # Por defecto, ser cauteloso
    
    final_reason = " | ".join(reasons) if reasons else "Sin información suficiente"
    
    logger.info(f"Veredicto combinado para {url}: {final_verdict} (scores: {scores})")
    
    return final_verdict, final_reason