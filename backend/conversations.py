
import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import engine
from models import Conversation, ChatMessage

router = APIRouter(
    prefix="/conversations",
    tags=["Chat History"],
)


class ConversationCreate(BaseModel):
    title: str = Field(
        default="New Conversation",
        min_length=1,
        max_length=255,
    )


class MessageCreate(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1)
    sources: list[dict] | None = None


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    sources: list[dict] | None
    created_at: str


def serialize_message(message: ChatMessage) -> dict:
    try:
        sources = json.loads(message.sources) if message.sources else None
    except (json.JSONDecodeError, TypeError):
        sources = None

    return {
        "id": str(message.id),
        "role": message.role,
        "content": message.content,
        "sources": sources,
        "created_at": message.created_at.isoformat(),
    }


@router.post("/")
def create_conversation(payload: ConversationCreate):
    title = payload.title.strip()

    if not title:
        raise HTTPException(
            status_code=422,
            detail="Conversation title cannot be empty.",
        )

    with Session(engine) as session:
        conversation = Conversation(title=title)
        session.add(conversation)
        session.commit()
        session.refresh(conversation)

        return {
            "id": str(conversation.id),
            "title": conversation.title,
            "created_at": conversation.created_at.isoformat(),
            "updated_at": conversation.updated_at.isoformat(),
            "messages": [],
        }


@router.get("/")
def list_conversations():
    with Session(engine) as session:
        conversations = (
            session.query(Conversation)
            .order_by(Conversation.updated_at.desc())
            .all()
        )

        return [
            {
                "id": str(conversation.id),
                "title": conversation.title,
                "created_at": conversation.created_at.isoformat(),
                "updated_at": conversation.updated_at.isoformat(),
                "message_count": len(conversation.messages),
            }
            for conversation in conversations
        ]


@router.get("/{conversation_id}")
def get_conversation(conversation_id: UUID):
    with Session(engine) as session:
        conversation = session.get(Conversation, conversation_id)

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        return {
            "id": str(conversation.id),
            "title": conversation.title,
            "created_at": conversation.created_at.isoformat(),
            "updated_at": conversation.updated_at.isoformat(),
            "messages": [
                serialize_message(message)
                for message in conversation.messages
            ],
        }


@router.post("/{conversation_id}/messages")
def add_message(conversation_id: UUID, payload: MessageCreate):
    content = payload.content.strip()

    if not content:
        raise HTTPException(
            status_code=422,
            detail="Message content cannot be empty.",
        )

    with Session(engine) as session:
        conversation = session.get(Conversation, conversation_id)

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        message = ChatMessage(
            conversation_id=conversation.id,
            role=payload.role,
            content=content,
            sources=(
                json.dumps(payload.sources)
                if payload.sources is not None
                else None
            ),
        )

        session.add(message)

        if payload.role == "user" and conversation.title == "New Conversation":
            conversation.title = content[:60]

        session.commit()
        session.refresh(message)
        session.refresh(conversation)

        return {
            "message": serialize_message(message),
            "conversation_updated_at": conversation.updated_at.isoformat(),
        }


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: UUID):
    with Session(engine) as session:
        conversation = session.get(Conversation, conversation_id)

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        session.delete(conversation)
        session.commit()

        return {
            "message": "Conversation deleted successfully.",
            "conversation_id": str(conversation_id),
        }
