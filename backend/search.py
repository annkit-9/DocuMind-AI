
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import engine
from models import Document, DocumentChunk
from embedding_service import generate_query_embedding

router = APIRouter(prefix="/search", tags=["Semantic Search"])


@router.get("/")
def semantic_search(
    q: str = Query(..., min_length=2, max_length=1000),
    limit: int = Query(default=5, ge=1, le=20),
):
    try:
        query_vector = generate_query_embedding(q)

        distance = DocumentChunk.embedding.cosine_distance(query_vector)

        statement = (
            select(
                DocumentChunk.id,
                DocumentChunk.document_id,
                DocumentChunk.chunk_index,
                DocumentChunk.content,
                Document.title,
                Document.original_filename,
                distance.label("distance"),
            )
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.embedding.is_not(None))
            .order_by(distance)
            .limit(limit)
        )

        with Session(engine) as session:
            rows = session.execute(statement).all()

        results = []
        for row in rows:
            results.append(
                {
                    "document_id": str(row.document_id),
                    "filename": row.original_filename,
                    "title": row.title,
                    "chunk_index": row.chunk_index,
                    "content": row.content,
                    "similarity_score": round(
                        max(0.0, min(1.0, 1.0 - float(row.distance))),
                        4,
                    ),
                }
            )

        return {
            "query": q,
            "results_count": len(results),
            "results": results,
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Semantic search failed. Check the backend terminal logs.",
        )
