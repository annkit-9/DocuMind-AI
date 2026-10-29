
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# Load .env from the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

password = os.getenv("POSTGRES_PASSWORD")

if not password:
    raise RuntimeError("POSTGRES_PASSWORD is missing from the root .env file")

DATABASE_URL = URL.create(
    drivername="postgresql+psycopg",
    username="documind",
    password=password,
    host="127.0.0.1",
    port=5433,
    database="documind",
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)


def check_database():
    with engine.connect() as connection:
        return connection.execute(
            text("SELECT current_database(), version()")
        ).fetchone()
