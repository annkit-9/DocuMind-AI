
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import engine
from documents import router as documents_router
from search import router as search_router
from rag import router as rag_router
from conversations import router as conversations_router


app = FastAPI(
    title="DocuMind AI",
    description="Semantic Document Search and RAG API",
    version="0.5.0",
)

# Local frontend URLs
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Add deployed frontend URL through environment variables
frontend_url = os.getenv("FRONTEND_URL", "").strip()

if frontend_url:
    allowed_origins.append(frontend_url.rstrip("/"))

# Add additional origins if needed
extra_origins = os.getenv("ALLOWED_ORIGINS", "")

if extra_origins:
    allowed_origins.extend(
        origin.strip().rstrip("/")
        for origin in extra_origins.split(",")
        if origin.strip()
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(allowed_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(rag_router)
app.include_router(conversations_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to DocuMind AI!",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "DocuMind AI Backend",
    }


@app.get("/health/database")
def database_health():
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("SELECT current_database()")
            ).scalar_one()

        return {
            "status": "connected",
            "database": result,
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed. Check server logs.",
        )
