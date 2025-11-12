import os
import re
import logging
import json
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger(__name__)


async def _post_to_gemini(
    prompt: str, 
    gemini_key: str, 
    gemini_url: str, 
    max_tokens: int = 400, 
    timeout: float = 15.0
) -> httpx.Response:
    """
    Realiza POST a la API de Google Gemini.
    """
    headers = {
        "Content-Type": "application/json"
    }
    
    # Si la URL contiene 'generativelanguage.googleapis.com', es la API oficial de Google
    if "generativelanguage.googleapis.com" in gemini_url:
        # Formato para Google Gemini API oficial (v1beta)
        url_with_key = f"{gemini_url}?key={gemini_key}"
        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.1,
                "topP": 0.8,
                "topK": 10
            }
        }
    else:
        # Formato genérico para APIs custom
        headers["Authorization"] = f"Bearer {gemini_key}"
        url_with_key = gemini_url
        payload = {
            "prompt": prompt, 
            "max_tokens": max_tokens
        }
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            logger.info(f"Llamando a Gemini API: {gemini_url}")
            response = await client.post(url_with_key, json=payload, headers=headers)
            response.raise_for_status()
            logger.info(f"Respuesta de Gemini: {response.status_code}")
            return response
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error from Gemini: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            raise


def _parse_gemini_response(response_data: dict) -> str:
    """Extrae el texto de la respuesta de Google Gemini."""
    try:
        # Formato de respuesta de Google Gemini v1beta
        if "candidates" in response_data:
            candidates = response_data["candidates"]
            if candidates and len(candidates) > 0:
                candidate = candidates[0]
                content = candidate.get("content", {})
                parts = content.get("parts", [])
                if parts and len(parts) > 0:
                    text = parts[0].get("text", "")
                    if text:
                        return text
        
        # Formato alternativo
        if "text" in response_data:
            return response_data["text"]
        
        # Si viene como string directo
        if isinstance(response_data, str):
            return response_data
        
        logger.warning(f"Formato de respuesta no reconocido: {response_data}")
        return json.dumps(response_data)
        
    except Exception as e:
        logger.warning(f"Error parsing Gemini response: {e}")
        return str(response_data)


def _parse_provider_text_response(text_resp: str) -> Dict[str, Any]:
    """Intenta extraer información de una respuesta textual."""
    # Intentar parsear como JSON primero
    try:
        # Limpiar markdown code blocks si existen
        text_clean = text_resp.strip()
        
        # Remover bloques de código markdown
        if "```json" in text_clean:
            # Extraer solo el contenido entre ```json y ```
            start = text_clean.find("```json") + 7
            end = text_clean.find("```", start)
            if end > start:
                text_clean = text_clean[start:end].strip()
        elif text_clean.startswith("```") and text_clean.endswith("```"):
            text_clean = text_clean[3:-3].strip()
        
        data = json.loads(text_clean)
        if isinstance(data, dict):
            verdict = data.get("verdict", "Sospechoso")
            
            # Normalizar nombres de veredicto
            verdict_lower = verdict.lower()
            if "phishing" in verdict_lower or "malicioso" in verdict_lower or "malicious" in verdict_lower:
                verdict = "Phishing"
            elif "sospech" in verdict_lower or "suspicious" in verdict_lower:
                verdict = "Sospechoso"
            elif "seguro" in verdict_lower or "safe" in verdict_lower:
                verdict = "Seguro"
            
            try:
                percentage = int(data.get("percentage", 50))
            except (ValueError, TypeError):
                percentage = 50
            
            reasons = data.get("reasons", [])
            if not isinstance(reasons, list):
                reasons = [str(reasons)] if reasons else []
            
            return {
                "verdict": verdict,
                "percentage": percentage,
                "reasons": reasons,
                "url_results": data.get("url_results", []),
                "raw": data
            }
    except (json.JSONDecodeError, ValueError) as e:
        logger.debug(f"No se pudo parsear JSON: {e}")
    
    # Fallback: análisis heurístico del texto
    m_pct = re.search(r"(\d{1,3})\s*%", text_resp)
    pct = int(m_pct.group(1)) if m_pct else 50
    
    lower = text_resp.lower()
    if "phishing" in lower or "malicious" in lower or "malicioso" in lower:
        verdict = "Phishing"
        pct = max(pct, 70)
    elif "sospech" in lower or "suspicious" in lower:
        verdict = "Sospechoso"
        pct = max(pct, 40)
    elif "seguro" in lower or "safe" in lower:
        verdict = "Seguro"
        pct = min(pct, 30)
    else:
        verdict = "Sospechoso"
    
    reasons = [text_resp.strip()[:200]] if text_resp.strip() else ["Análisis basado en heurística"]
    
    return {
        "verdict": verdict,
        "percentage": pct,
        "reasons": reasons,
        "url_results": [],
        "raw": text_resp
    }


async def analyze_text(
    text: str,
    gemini_key: Optional[str] = None,
    gemini_url: Optional[str] = None,
    max_tokens: int = 500,
    timeout: float = 15.0
) -> Dict[str, Any]:
    """Analiza texto usando la API de Gemini."""
    
    gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
    gemini_url = gemini_url or os.getenv("GEMINI_API_URL")
    
    if not gemini_key or not gemini_url:
        raise RuntimeError("Gemini API not configured (GEMINI_API_KEY and GEMINI_API_URL required)")
    
    prompt = (
        "Eres un experto en ciberseguridad especializado en detectar phishing. "
        "Analiza el siguiente texto y determina si es phishing, sospechoso o seguro.\n\n"
        "IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código) con esta estructura:\n"
        "{\n"
        '  "verdict": "Seguro" o "Sospechoso" o "Phishing",\n'
        '  "percentage": número entre 0 y 100 indicando el nivel de riesgo,\n'
        '  "reasons": ["razón 1", "razón 2", "..."],\n'
        '  "url_results": []\n'
        "}\n\n"
        f"TEXTO A ANALIZAR:\n{text}\n\n"
        "Responde solo con el JSON, sin texto adicional:"
    )
    
    try:
        resp = await _post_to_gemini(prompt, gemini_key, gemini_url, max_tokens, timeout)
        
        # Parsear respuesta según el formato
        try:
            response_data = resp.json()
            text_content = _parse_gemini_response(response_data)
            logger.info(f"Contenido extraído de Gemini: {text_content[:200]}...")
        except Exception as e:
            logger.warning(f"Error parseando JSON de respuesta: {e}")
            text_content = resp.text
        
        return _parse_provider_text_response(text_content)
        
    except Exception as e:
        logger.error(f"Error in analyze_text: {e}")
        raise


async def analyze_url(
    url: str,
    gemini_key: Optional[str] = None,
    gemini_url: Optional[str] = None,
    max_tokens: int = 300,
    timeout: float = 10.0
) -> Dict[str, Any]:
    """Analiza una URL usando la API de Gemini."""
    
    gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
    gemini_url = gemini_url or os.getenv("GEMINI_API_URL")
    
    if not gemini_key or not gemini_url:
        raise RuntimeError("Gemini API not configured")
    
    prompt = (
        "Eres un experto en ciberseguridad. Analiza la siguiente URL y determina si es maliciosa.\n\n"
        "IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido (sin markdown) con esta estructura:\n"
        "{\n"
        '  "verdict": "Segura" o "Sospechosa" o "Maliciosa",\n'
        '  "reason": "explicación breve",\n'
        '  "score": número entre 0 y 100\n'
        "}\n\n"
        f"URL: {url}\n\n"
        "Responde solo con el JSON:"
    )
    
    try:
        resp = await _post_to_gemini(prompt, gemini_key, gemini_url, max_tokens, timeout)
        
        try:
            response_data = resp.json()
            text_content = _parse_gemini_response(response_data)
        except:
            text_content = resp.text
        
        # Intentar parsear JSON
        try:
            # Limpiar markdown
            text_clean = text_content.strip()
            if "```json" in text_clean:
                start = text_clean.find("```json") + 7
                end = text_clean.find("```", start)
                if end > start:
                    text_clean = text_clean[start:end].strip()
            elif text_clean.startswith("```") and text_clean.endswith("```"):
                text_clean = text_clean[3:-3].strip()
            
            data = json.loads(text_clean)
            
            verdict = data.get("verdict", "Desconocido")
            # Normalizar veredicto
            verdict_lower = verdict.lower()
            if "maliciosa" in verdict_lower or "malicious" in verdict_lower:
                verdict = "Maliciosa"
            elif "sospechosa" in verdict_lower or "suspicious" in verdict_lower:
                verdict = "Sospechosa"
            elif "segura" in verdict_lower or "safe" in verdict_lower:
                verdict = "Segura"
            
            return {
                "verdict": verdict,
                "reason": data.get("reason", "Sin detalles"),
                "score": int(data.get("score", 0)),
                "raw": data
            }
        except (json.JSONDecodeError, ValueError):
            # Análisis heurístico del texto
            text_lower = text_content.lower()
            if "maliciosa" in text_lower or "malicious" in text_lower:
                verdict = "Maliciosa"
            elif "sospechosa" in text_lower or "suspicious" in text_lower:
                verdict = "Sospechosa"
            else:
                verdict = "Segura"
            
            return {
                "verdict": verdict,
                "reason": text_content[:200],
                "score": 50,
                "raw": text_content
            }
            
    except Exception as e:
        logger.error(f"Error in analyze_url: {e}")
        raise