import os
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="Scrum Master Agent", version="0.1.0")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "sm-agent",
        "mode": os.getenv("MODE", "mock"),
    }


@app.get("/.well-known/agent-card.json")
def agent_card() -> JSONResponse:
    card = {
        "name": "Scrum Master Agent",
        "description": "Proposes the team, sprint cadence, and status digests for SDLC delivery work.",
        "version": "0.1.0",
        "provider": "internal",
        "supportedInterfaces": ["json-rpc-http"],
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
        },
        "skills": [
            {"id": "team.propose", "name": "Team Propose", "tags": ["team", "sprint"]},
            {"id": "sprint.plan", "name": "Sprint Plan", "tags": ["sprint", "planning"]},
            {"id": "story.assign", "name": "Story Assign", "tags": ["assignment", "stories"]},
            {"id": "status.report", "name": "Status Report", "tags": ["status", "teams"]},
            {"id": "impediment.resolve", "name": "Impediment Resolve", "tags": ["impediment", "escalation"]},
        ],
        "securitySchemes": [],
    }
    return JSONResponse(content=card)


@app.get("/api/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "service": "sm-agent"}
