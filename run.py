import uvicorn

if __name__ == "__main__":
    # NO importar 'app' aquí, solo pasar la ruta como string
    uvicorn.run(
        "app.main:app",  # String, no importación
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )