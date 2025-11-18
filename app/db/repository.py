# app/db/repository.py
from .database import get_db_conn

def add_history_db(entry: dict):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO history (username,type,input,verdict,percentage,timestamp) VALUES (?,?,?,?,?,?)",
        (entry.get("username"), entry.get("type"), entry.get("input"),
         entry.get("verdict"), entry.get("percentage"), entry.get("timestamp"))
    )
    conn.commit()
    conn.close()

def get_history_db(username: str | None = None):
    conn = get_db_conn()
    cur = conn.cursor()
    if username:
        cur.execute(
            "SELECT type,input,verdict,percentage,timestamp FROM history WHERE username=? ORDER BY id ASC",
            (username,)
        )
    else:
        cur.execute("SELECT type,input,verdict,percentage,timestamp FROM history ORDER BY id ASC")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def clear_history_db(username: str | None = None):
    conn = get_db_conn()
    cur = conn.cursor()
    if username:
        cur.execute("DELETE FROM history WHERE username=?", (username,))
        deleted = cur.rowcount
    else:
        cur.execute("DELETE FROM history")
        deleted = cur.rowcount
    conn.commit()
    conn.close()
    return deleted

def get_stats_db_for_user(username: str):
    conn = get_db_conn()
    cur = conn.cursor()
    
    # 1. Obtener TODAS las entradas (texto y URL)
    cur.execute(
        "SELECT type, verdict, percentage FROM history WHERE username=?",
        (username,)
    )
    rows = cur.fetchall()
    conn.close()

    total = len(rows)
    if total == 0:
        return {"total": 0, "avg_risk": 0, "safe": 0, "suspicious": 0, "phishing": 0}

    # 2. Normalizar porcentajes
    # Si tiene porcentaje (texto), usarlo.
    # Si no (URL), mapear veredicto a un % estimado para la estadística global.
    normalized_scores = []
    
    for r in rows:
        rtype = r["type"]
        verdict = r["verdict"]
        percentage = r["percentage"]
        
        if percentage is not None:
            normalized_scores.append(percentage)
        else:
            # Mapeo de veredictos de URL a riesgo numérico
            if verdict == "Segura":
                normalized_scores.append(10) # Bajo riesgo
            elif verdict == "Maliciosa":
                normalized_scores.append(90) # Alto riesgo
            else:
                normalized_scores.append(50) # Sospechosa/Desconocido

    # 3. Calcular métricas
    avg_risk = sum(normalized_scores) / total if total > 0 else 0
    
    # Categorizar según el score normalizado
    safe_count = len([s for s in normalized_scores if s <= 33])
    suspicious_count = len([s for s in normalized_scores if 33 < s <= 66])
    phishing_count = len([s for s in normalized_scores if s > 66])

    safe_pct = (safe_count / total) * 100
    suspicious_pct = (suspicious_count / total) * 100
    phishing_pct = (phishing_count / total) * 100
    
    return {
        "total": total,
        "avg_risk": int(avg_risk),
        "safe": int(safe_pct),
        "suspicious": int(suspicious_pct),
        "phishing": int(phishing_pct)
    }