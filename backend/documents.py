
from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile
from pypdf import PdfReader
from sqlalchemy.orm import Session

from database import engine
from models import Document, DocumentChunk

from starlette.concurrency import run_in_threadpool
from embedding_service import generate_embeddings
from uuid import UUID


router = APIRouter(prefix="/documents", tags=["Documents"])

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


def split_text(text: str) -> list[str]:
    """Split text into overlapping chunks."""
    text = " ".join(text.split())

    if not text:
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end == len(text):
            break

        start = end - CHUNK_OVERLAP

    return chunks


@router.post("/upload", status_code=201)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing.")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    file_bytes = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="PDF exceeds the 15 MB limit.",
        )

    if not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF.",
        )

    try:
        reader = PdfReader(BytesIO(file_bytes), strict=False)

        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported yet.",
            )

        if len(reader.pages) == 0:
            raise HTTPException(
                status_code=400,
                detail="The PDF has no pages.",
            )

        extracted_pages = []

        for page in reader.pages:
            extracted_pages.append(page.extract_text() or "")

        extracted_text = "\n\n".join(extracted_pages)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF. Please check the file.",
        )

    chunks = split_text(extracted_text)

    if not chunks:
        raise HTTPException(
            status_code=422,
            detail=(
                "No readable text was found. "
                "Scanned PDFs need OCR, which will be added later."
            ),
        )

    try:
        vectors = await run_in_threadpool(
            generate_embeddings,
            chunks,
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate document embeddings.",
        )
        
    try:
        with Session(engine) as session:
            document = Document(
                title=file.filename.rsplit(".", 1)[0],
                original_filename=file.filename,
                content_type="application/pdf",
                status="processed",
            )

            session.add(document)
            session.flush()

            for index, chunk_text in enumerate(chunks):
                session.add(
                    DocumentChunk(
                        document_id=document.id,
                        chunk_index=index,
                        content=chunk_text,
                        embedding=vectors[index],
                    )
                )

            session.commit()

            return {
                "message": "PDF uploaded and processed successfully.",
                "document_id": str(document.id),
                "filename": document.original_filename,
                "pages": len(reader.pages),
                "chunks_saved": len(chunks),
                "characters_extracted": len(extracted_text),
            }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to save the document to the database.",
        )


@router.get("/")
def list_documents():
    """Return saved documents from the database."""
    try:
        with Session(engine) as session:
            documents = (
                session.query(Document)
                .order_by(Document.created_at.desc())
                .all()
            )

            results = []

            for document in documents:
                results.append(
                    {
                        "id": str(document.id),
                        "title": document.title,
                        "filename": document.original_filename,
                        "content_type": document.content_type,
                        "status": document.status,
                        "created_at": (
                            document.created_at.isoformat()
                            if document.created_at
                            else None
                        ),
                        "pages": None,
                        "chunks": len(document.chunks),
                    }
                )

            return {
                "count": len(results),
                "documents": results,
            }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not load documents from the database.",
        )


@router.delete("/{document_id}")
def delete_document(document_id: UUID):
    """Delete a document and its associated chunks."""
    try:
        with Session(engine) as session:
            document = session.get(Document, document_id)

            if document is None:
                raise HTTPException(
                    status_code=404,
                    detail="Document not found.",
                )

            filename = document.original_filename

            # Explicitly delete the associated chunks first.
            session.query(DocumentChunk).filter(
                DocumentChunk.document_id == document_id
            ).delete(synchronize_session=False)

            session.delete(document)
            session.commit()

            return {
                "message": "Document deleted successfully.",
                "document_id": str(document_id),
                "filename": filename,
            }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not delete the document.",
        )
