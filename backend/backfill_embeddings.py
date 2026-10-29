
from sqlalchemy.orm import Session

from database import engine
from models import DocumentChunk
from embedding_service import generate_embeddings


def backfill_embeddings():
    batch_size = 16
    total_updated = 0

    with Session(engine) as session:
        try:
            while True:
                chunks = (
                    session.query(DocumentChunk)
                    .filter(DocumentChunk.embedding.is_(None))
                    .order_by(
                        DocumentChunk.document_id,
                        DocumentChunk.chunk_index,
                    )
                    .limit(batch_size)
                    .all()
                )

                if not chunks:
                    break

                texts = [chunk.content for chunk in chunks]
                vectors = generate_embeddings(texts)

                for chunk, vector in zip(chunks, vectors):
                    chunk.embedding = vector

                session.commit()
                total_updated += len(chunks)

                print(f"Embeddings saved: {total_updated}")

        except Exception:
            session.rollback()
            raise

    print(f"Backfill complete. Total chunks updated: {total_updated}")


if __name__ == "__main__":
    backfill_embeddings()
