from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .api.routes import auth, analyze, history, stats
from .db.database import init_db, migrate_json_history, ensure_db_schema

app = FastAPI(title="PhishGuard AI")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar DB al arrancar
@app.on_event("startup")
async def startup_event():
    init_db()
    migrate_json_history()
    ensure_db_schema()

# Incluir routers
app.include_router(auth.router, tags=["auth"])
app.include_router(analyze.router, tags=["analyze"])
app.include_router(history.router, tags=["history"])
app.include_router(stats.router, tags=["stats"])

# Determinar la ruta de archivos estáticos
# Los archivos static/ están en la raíz del proyecto, no dentro de app/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Si existe carpeta static/, servir archivos
if os.path.exists(STATIC_DIR):
    @app.get("/")
    async def root():
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path, media_type="text/html")
        return {"message": "PhishGuard AI API - v1.0"}

    @app.get("/style.css")
    async def get_css():
        file_path = os.path.join(STATIC_DIR, "style.css")
        if os.path.exists(file_path):
            return FileResponse(file_path, media_type="text/css")
        return {"error": "File not found"}

    @app.get("/script.js")
    async def get_js():
        file_path = os.path.join(STATIC_DIR, "script.js")
        if os.path.exists(file_path):
            return FileResponse(file_path, media_type="application/javascript")
        return {"error": "File not found"}
else:
    @app.get("/")
    async def root():
        return {"message": "PhishGuard AI API - v1.0", "docs": "/docs"}