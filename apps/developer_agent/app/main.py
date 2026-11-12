import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

CARD: dict[str, Any] = json.loads(Path(__file__).with_name("agent_card.json").read_text(encoding="utf-8"))
SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "developer-agent")

app = FastAPI(title=CARD["name"], version=CARD["version"])


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": SERVICE_NAME, "mode": os.getenv("MODE", "mock")}


@app.get("/.well-known/agent-card.json")
def agent_card() -> JSONResponse:
    return JSONResponse(content=CARD)


@app.get("/api/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "service": SERVICE_NAME}
