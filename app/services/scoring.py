# app/services/scoring.py
import re
from typing import List, Dict, Any
from urllib.parse import urlparse

def extract_urls(text: str) -> List[str]:
    pattern = r"https?://[\w\-\.\/~:?&=#%+\[\]]+"
    return re.findall(pattern, text)

def score_url(url: str) -> Dict[str, Any]:
    """
    Analiza una URL con heurísticas mejoradas para detectar phishing.
    Retorna score, verdict y razones detalladas.
    """
    score = 0
    reasons = []
    
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        path = parsed.path.lower()
        full_url_lower = url.lower()
    except Exception:
        return {
            "url": url,
            "score": 50,
            "verdict": "Sospechosa",
            "reason": "URL mal formada o inválida"
        }
    
    # 1. Uso de dirección IP en lugar de dominio (muy sospechoso)
    if re.search(r"https?://(?:\d{1,3}\.){3}\d{1,3}", url):
        score += 35
        reasons.append("⚠️ Uso de dirección IP en lugar de dominio")
    
    # 2. URL extremadamente larga (a menudo usada para ocultar el destino real)
    if len(url) > 100:
        score += 20
        reasons.append("URL excesivamente larga")
    elif len(url) > 75:
        score += 10
        reasons.append("URL muy larga")
    
    # 3. Muchos subdominios (ej: secure.login.paypal.fake-site.com)
    subdomain_count = domain.count('.')
    if subdomain_count > 3:
        score += 25
        reasons.append(f"Demasiados subdominios ({subdomain_count})")
    elif subdomain_count > 2:
        score += 10
    
    # 4. Uso excesivo de guiones (técnica común de phishing)
    if domain.count("-") > 3:
        score += 20
        reasons.append("Uso excesivo de guiones en el dominio")
    elif domain.count("-") > 1:
        score += 5
    
    # 5. Caracteres sospechosos
    if re.search(r"[<>@]", url):
        score += 15
        reasons.append("Caracteres sospechosos en la URL")
    
    # 6. TLDs de alto riesgo
    high_risk_tlds = [".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".club", ".work"]
    if any(domain.endswith(t) for t in high_risk_tlds):
        score += 25
        reasons.append("TLD de alto riesgo (gratuito/spam)")
    
    # 7. Palabras clave de phishing en el dominio o path
    phishing_keywords = [
        "login", "signin", "account", "verify", "secure", "update", 
        "confirm", "banking", "paypal", "amazon", "microsoft", "apple",
        "password", "suspend", "locked", "security", "validation"
    ]
    keyword_count = sum(1 for kw in phishing_keywords if kw in full_url_lower)
    if keyword_count >= 3:
        score += 30
        reasons.append(f"Múltiples palabras clave de phishing ({keyword_count})")
    elif keyword_count >= 2:
        score += 20
        reasons.append("Palabras clave de phishing detectadas")
    elif keyword_count == 1:
        score += 10
    
    # 8. Dominios que imitan marcas conocidas
    brand_impersonation = [
        "paypa1", "paypa-", "paypai", "amaz0n", "amazom", "micros0ft", 
        "g00gle", "gooogle", "appleid", "netfIix", "whatsap"
    ]
    if any(brand in domain for brand in brand_impersonation):
        score += 40
        reasons.append("⚠️ Posible imitación de marca conocida")
    
    # 9. Puerto no estándar
    if parsed.port and parsed.port not in [80, 443]:
        score += 15
        reasons.append(f"Puerto no estándar ({parsed.port})")
    
    # 10. Uso de @ en la URL (puede ocultar el dominio real)
    if "@" in url:
        score += 35
        reasons.append("⚠️ Carácter @ detectado (técnica de ocultación)")
    
    # 11. Números en el dominio (sospechoso para marcas legítimas)
    if re.search(r"\d+", domain):
        score += 8
        reasons.append("Números en el dominio")
    
    # 12. Codificación hexadecimal o URL encoding sospechosa
    if "%" in url and url.count("%") > 3:
        score += 15
        reasons.append("Codificación de URL sospechosa")
    
    # 13. HTTPS pero dominio sospechoso
    if parsed.scheme == "http":
        score += 10
        reasons.append("No usa HTTPS")
    
    # Normalizar score
    score = max(0, min(100, score))
    
    # Determinar veredicto
    if score > 60:
        verdict = "Maliciosa"
    elif score > 30:
        verdict = "Sospechosa"
    else:
        verdict = "Segura"
    
    reason = "; ".join(reasons) if reasons else "No se detectaron señales de phishing obvias"
    
    return {
        "url": url,
        "score": score,
        "verdict": verdict,
        "reason": reason
    }


def score_text(text: str) -> Dict[str, Any]:
    """Analiza texto buscando indicadores de phishing."""
    score = 0
    reasons = []
    
    keywords_high = [
        "transferir", "verifique", "verificar", "bloqueada", "urgente",
        "inmediatamente", "confirmar", "credenciales", "contraseña", "pago"
    ]
    keywords_medium = [
        "problema", "alerta", "suscrito", "ganó", "felicitaciones"
    ]

    low_count = sum(1 for w in keywords_medium if w in text.lower())
    mid_count = sum(1 for w in keywords_high if w in text.lower())
    
    score += mid_count * 18
    score += low_count * 8

    urls = extract_urls(text)
    if urls:
        for u in urls:
            url_info = score_url(u)
            score += url_info["score"] * 0.6
            reasons.append(f"URL detectada: {u} ({url_info['verdict']})")

    if re.search(r"[A-Z]{5,}", text):
        score += 8
        reasons.append("Texto en mayúsculas — tono alarmista")
    
    if text.count("!") >= 2:
        score += 6
        reasons.append("Uso excesivo de signos de exclamación")

    score = int(max(0, min(100, score)))
    verdict = "Phishing" if score > 66 else "Sospechoso" if score > 33 else "Seguro"
    
    return {
        "percentage": score,
        "verdict": verdict,
        "reasons": reasons,
        "url_results": [score_url(u) for u in urls]
    }