# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles  
import os

from .api.routes import auth, analyze, history, stats
from .db.database import init_db, migrate_json_history, ensure_db_schema

app = FastAPI(title="PhishGuard AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db(); migrate_json_history(); ensure_db_schema()

app.include_router(auth.router, prefix="")
app.include_router(analyze.router, prefix="")
app.include_router(history.router, prefix="")
app.include_router(stats.router, prefix="")


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# 2. MONTAR EL DIRECTORIO ESTÁTICO

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


#
# @app.get("/")
# async def root():
#     idx = os.path.join(STATIC_DIR, "index.html")
#     return FileResponse(idx) if os.path.exists(idx) else {"msg": "PhishGuard API"}