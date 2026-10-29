
import { useEffect, useState } from "react";
import "./index.css";

const API_URL = "http://127.0.0.1:8000";

const suggestions = [
  "Summarize my uploaded documents",
  "What are the most important topics?",
  "Create a study plan from my PDFs",
];

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState(null);

  // Load saved documents and conversations when the app opens.
  useEffect(() => {
    loadDocuments();
    loadConversations();
  }, []);

  async function loadDocuments() {
    try {
      const response = await fetch(`${API_URL}/documents/`);

      if (!response.ok) {
        throw new Error("Could not load saved documents.");
      }

      const data = await response.json();

      setDocuments(
        (data.documents || []).map((doc) => ({
          id: doc.id,
          name: doc.filename ?? doc.original_filename ?? doc.title,
          chunks: doc.chunks ?? 0,
          pages: doc.pages ?? null,
        }))
      );
    } catch (err) {
      console.error("Document loading failed:", err);
      setError("Could not load saved documents. Check the backend.");
    }
  }

  async function loadConversations() {
    try {
      const response = await fetch(`${API_URL}/conversations/`);

      if (!response.ok) {
        throw new Error("Could not load chat history.");
      }

      const data = await response.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Chat history loading failed:", err);
      setError("Could not load chat history. Check the backend.");
    }
  }

  // Upload a PDF.
  async function uploadPDF(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError("The PDF must be smaller than 15 MB.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "PDF upload failed."
        );
      }

      const newDocument = {
        id: data.document_id,
        name: data.filename ?? file.name,
        chunks: data.chunks_saved ?? 0,
        pages: data.pages ?? null,
      };

      setDocuments((previous) => [
        newDocument,
        ...previous.filter((doc) => doc.id !== newDocument.id),
      ]);
    } catch (err) {
      console.error("PDF upload failed:", err);
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the backend. Check FastAPI and CORS."
          : err.message
      );
    } finally {
      setUploading(false);
    }
  }

  // Delete a saved document.
  async function deleteDocument(doc) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${doc.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch(`${API_URL}/documents/${doc.id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Could not delete document."
        );
      }

      setDocuments((previous) =>
        previous.filter((item) => item.id !== doc.id)
      );
    } catch (err) {
      console.error("Document deletion failed:", err);
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the backend."
          : err.message
      );
    }
  }

  // Open an existing conversation.
  async function openConversation(conversationId) {
    setHistoryLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/conversations/${conversationId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not open conversation.");
      }

      setActiveConversationId(data.id);

      setMessages(
        (data.messages || []).map((message) => ({
          role: message.role,
          content: message.content,
          sources: message.sources || [],
        }))
      );

      setQuestion("");
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Delete a conversation and its messages.
  async function deleteConversation(conversation) {
    const confirmed = window.confirm(
      `Delete "${conversation.title}" and all its messages?`
    );

    if (!confirmed) return;

    setDeletingConversationId(conversation.id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/conversations/${conversation.id}`,
        { method: "DELETE" }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Could not delete conversation.");
      }

      setConversations((previous) =>
        previous.filter((item) => item.id !== conversation.id)
      );

      if (activeConversationId === conversation.id) {
        setActiveConversationId(null);
        setMessages([]);
        setQuestion("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingConversationId(null);
    }
  }

  // Ask a question and save both the question and answer.
  async function askQuestion(text = question) {
    const cleanQuestion = text.trim();

    if (!cleanQuestion || asking) return;

    setError("");
    setQuestion("");
    setAsking(true);

    const userMessage = {
      role: "user",
      content: cleanQuestion,
    };

    setMessages((previous) => [...previous, userMessage]);

    let conversationId = activeConversationId;
    let userMessageSaved = false;

    try {
      // Create a new conversation if this is the first question.
      if (!conversationId) {
        const createResponse = await fetch(`${API_URL}/conversations/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Conversation" }),
        });

        const created = await createResponse.json();

        if (!createResponse.ok) {
          throw new Error(
            created.detail || "Could not create conversation."
          );
        }

        conversationId = created.id;
        setActiveConversationId(conversationId);
      }

      // Save the user's question first.
      const saveUserResponse = await fetch(
        `${API_URL}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "user",
            content: cleanQuestion,
          }),
        }
      );

      const savedUser = await saveUserResponse.json();

      if (!saveUserResponse.ok) {
        throw new Error(
          savedUser.detail || "Could not save your question."
        );
      }

      userMessageSaved = true;

      // Use the existing RAG endpoint.
      const response = await fetch(`${API_URL}/ask/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Could not generate an answer."
        );
      }

      const assistantMessage = {
        role: "assistant",
        content: data.answer ?? "No answer was returned.",
        sources: data.sources || [],
        model: data.model,
      };

      // Save the AI response and its retrieved sources.
      const saveAssistantResponse = await fetch(
        `${API_URL}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            content: assistantMessage.content,
            sources: assistantMessage.sources,
          }),
        }
      );

      const savedAssistant = await saveAssistantResponse.json();

      if (!saveAssistantResponse.ok) {
        throw new Error(
          savedAssistant.detail ||
            "The answer was generated but could not be saved."
        );
      }

      setMessages((previous) => [...previous, assistantMessage]);
    } catch (err) {
      console.error("Question request failed:", err);

      // Keep the user's question visible and show a retry-friendly error.
      if (userMessageSaved) {
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content:
              "I couldn't complete or save the answer. Please check the error and try asking again.",
            failed: true,
          },
        ]);
      } else {
        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: "",
            failed: true,
          },
        ]);
      }

      setError(
        err.message === "Failed to fetch"
          ? "Could not connect to DocuMind AI. Check the backend and CORS."
          : err.message
      );
    } finally {
      setAsking(false);
      await loadConversations();
    }
  }

  // Start a fresh chat without deleting saved conversations.
  function startNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setQuestion("");
    setError("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">D</div>
          <div>
            <h1>
              DocuMind<span> AI</span>
            </h1>
            <p>YOUR KNOWLEDGE SPACE</p>
          </div>
        </div>

        <button
          className="new-chat"
          type="button"
          onClick={startNewChat}
        >
          <span>＋</span> New conversation
        </button>

        <div className="side-label">CHAT HISTORY</div>

        <div className="conversation-list">
          {historyLoading && (
            <p className="empty-documents">Loading conversation...</p>
          )}

          {!historyLoading && conversations.length === 0 && (
            <p className="empty-documents">
              Your saved conversations will appear here.
            </p>
          )}

          {conversations.map((conversation) => (
            <div
              className={`conversation-item ${
                activeConversationId === conversation.id ? "active" : ""
              }`}
              key={conversation.id}
            >
              <button
                className="conversation-open"
                type="button"
                onClick={() => openConversation(conversation.id)}
                disabled={historyLoading || asking}
                title={conversation.title}
              >
                <span className="conversation-icon">◷</span>
                <span className="conversation-title">
                  {conversation.title}
                </span>
              </button>

              <button
                className="delete-document"
                type="button"
                aria-label={`Delete ${conversation.title}`}
                title="Delete conversation"
                disabled={deletingConversationId === conversation.id}
                onClick={() => deleteConversation(conversation)}
              >
                {deletingConversationId === conversation.id ? "…" : "×"}
              </button>
            </div>
          ))}
        </div>

        <div className="side-label">WORKSPACE</div>

        <label className="upload-card">
          <div className="upload-icon">↑</div>
          <strong>
            {uploading ? "Processing PDF..." : "Upload documents"}
          </strong>
          <span>PDF files · Up to 15 MB</span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={uploadPDF}
            disabled={uploading}
          />
        </label>

        <div className="side-label document-heading">
          YOUR DOCUMENTS <span>{documents.length}</span>
        </div>

        <div className="document-list">
          {documents.length === 0 ? (
            <p className="empty-documents">
              Your uploaded files will appear here.
            </p>
          ) : (
            documents.map((doc) => (
              <div className="document-item" key={doc.id}>
                <div className="pdf-icon">PDF</div>

                <div className="document-info">
                  <strong title={doc.name}>{doc.name}</strong>
                  <span>
                    {doc.pages ?? "—"} pages · {doc.chunks} chunks
                  </span>
                </div>

                <button
                  className="delete-document"
                  type="button"
                  title={`Delete ${doc.name}`}
                  aria-label={`Delete ${doc.name}`}
                  onClick={() => deleteDocument(doc)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-bottom">
          <div className="local-badge">
            <span className="status-dot" />
            Local AI environment
          </div>
          <p>Your documents stay in your local database.</p>
        </div>
      </aside>

      <main className="main-panel">
        <div className="background-watermark" aria-hidden="true">
          <svg
            viewBox="0 0 240 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M65 34H139L177 72V191H65V34Z"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <path
              d="M139 34V73H177"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <path
              d="M88 101H145M88 123H130"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M112 157C112 145 122 136 134 138C142 125 162 132 163 146C176 149 177 168 164 173H126C118 173 112 166 112 157Z"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinejoin="round"
            />
            <circle cx="137" cy="151" r="4" fill="currentColor" />
            <circle cx="155" cy="151" r="4" fill="currentColor" />
            <path
              d="M137 162H155"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>AI Assistant</strong>
          </div>
          <div className="top-status">
            <span className="status-dot" /> Self-hosted
          </div>
        </header>

        <section className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-symbol">
                <div className="symbol-core">D</div>
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
              </div>

              <div className="eyebrow">
                YOUR PERSONAL KNOWLEDGE ENGINE
              </div>

              <h2>
                Every document.
                <br />
                <span>One conversation.</span>
              </h2>

              <p className="welcome-description">
                Upload your PDFs, ask questions in natural language, and
                discover insights grounded in your own documents.
              </p>

              <div className="feature-row">
                <div className="feature">
                  <span>⌕</span>
                  <div>
                    <strong>Semantic search</strong>
                    <small>Find relevant information</small>
                  </div>
                </div>

                <div className="feature">
                  <span>✳</span>
                  <div>
                    <strong>Local AI</strong>
                    <small>No paid AI API required</small>
                  </div>
                </div>

                <div className="feature">
                  <span>▤</span>
                  <div>
                    <strong>Source-backed</strong>
                    <small>See retrieved references</small>
                  </div>
                </div>
              </div>

              <div className="suggestion-heading">TRY ASKING</div>

              <div className="suggestions">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => askQuestion(item)}
                    disabled={asking}
                  >
                    <span>↗</span> {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <div
                  className={`message ${message.role}`}
                  key={`${message.role}-${index}`}
                >
                  <div className="message-avatar">
                    {message.role === "user" ? "You" : "D"}
                  </div>

                  <div className="message-body">
                    <div className="message-label">
                      {message.role === "user" ? "You" : "DocuMind AI"}
                    </div>

                    <div className="message-content">
                      {message.failed
                        ? message.content ||
                          "This request could not be completed. Please check the error message and try again."
                        : message.content}
                    </div>

                    {message.sources?.length > 0 && (
                      <div className="sources">
                        <strong>Retrieved sources</strong>

                        {message.sources.map((source, sourceIndex) => (
                          <div
                            className="source-item"
                            key={`${source.filename}-${source.chunk_index}-${sourceIndex}`}
                          >
                            <span className="source-file">PDF</span>
                            <div>
                              <b>{source.filename}</b>
                              <small>
                                Chunk {(source.chunk_index ?? 0) + 1}
                                {" · "}
                                Similarity{" "}
                                {Number.isFinite(source.similarity_score)
                                  ? `${(
                                      source.similarity_score * 100
                                    ).toFixed(1)}%`
                                  : "N/A"}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {asking && (
                <div className="message assistant">
                  <div className="message-avatar">D</div>
                  <div className="message-body">
                    <div className="message-label">DocuMind AI</div>
                    <div className="thinking">
                      <span />
                      <span />
                      <span />
                      <small>
                        Searching documents and generating an answer…
                      </small>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="composer-area">
          {error && (
            <div className="error-message" role="alert">
              <span>!</span> {error}
              <button type="button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              askQuestion();
            }}
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  askQuestion();
                }
              }}
              placeholder="Ask anything about your documents..."
              rows={2}
              disabled={asking}
            />

            <div className="composer-bottom">
              <span>
                Answers are generated from retrieved document context.
              </span>

              <button
                className="send-button"
                type="submit"
                disabled={!question.trim() || asking}
                aria-label="Send question"
              >
                {asking ? "…" : "↑"}
              </button>
            </div>
          </form>

          <p className="disclaimer">
            DocuMind AI can make mistakes. Verify important information
            against your original documents.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
