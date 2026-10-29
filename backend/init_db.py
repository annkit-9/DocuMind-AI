
from sqlalchemy import text

from database import engine
from models import Base


def initialize_database():
    # Ensure pgvector extension exists
    with engine.begin() as connection:
        connection.execute(
            text("CREATE EXTENSION IF NOT EXISTS vector")
        )

    # Create tables and indexes
    Base.metadata.create_all(bind=engine)

    print("Database initialized successfully!")
    print("Tables: documents, document_chunks")
    print("Vector search index created.")


if __name__ == "__main__":
    initialize_database()
