import os
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="Product Owner Agent", version="0.1.0")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "po-agent",
        "mode": os.getenv("MODE", "mock"),
    }


@app.get("/.well-known/agent-card.json")
def agent_card() -> JSONResponse:
    card = {
        "name": "Product Owner Agent",
        "description": "Drafts epics, stories, and acceptance criteria from project charters and source material.",
        "version": "0.1.0",
        "provider": "internal",
        "supportedInterfaces": ["json-rpc-http"],
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
        },
        "skills": [
            {"id": "requirements.draft", "name": "Requirements Draft", "tags": ["requirements", "epics"]},
            {"id": "backlog.prioritize", "name": "Backlog Prioritize", "tags": ["backlog", "wsjf"]},
            {"id": "story.clarify", "name": "Story Clarify", "tags": ["clarify", "stories"]},
            {"id": "story.accept", "name": "Story Accept", "tags": ["acceptance", "story"]},
        ],
        "securitySchemes": [],
    }
    return JSONResponse(content=card)


@app.get("/api/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "service": "po-agent"}
