
from functools import lru_cache

from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    """Load the local embedding model once and reuse it."""
    return SentenceTransformer(MODEL_NAME)


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Convert multiple text chunks into 384-dimensional vectors."""
    if not texts:
        return []

    model = get_embedding_model()

    vectors = model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return vectors.tolist()


def generate_query_embedding(query: str) -> list[float]:
    """Convert a search query into a 384-dimensional vector."""
    if not query or not query.strip():
        raise ValueError("Search query cannot be empty.")

    return generate_embeddings([query.strip()])[0]
