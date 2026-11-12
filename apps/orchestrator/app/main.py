import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="SDLC Orchestrator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["validated", "rejected"],
    "validated": ["in_progress", "rejected"],
    "in_progress": ["ready_for_review", "blocked"],
    "ready_for_review": ["approved", "rejected"],
    "approved": ["completed"],
    "blocked": ["in_progress", "rejected"],
    "rejected": ["draft"],
    "completed": [],
}

INTEGRATIONS: list[dict[str, Any]] = [
    {
        "name": "Jira",
        "status": "connected",
        "kind": "work-item-system",
        "owner": "delivery-ops",
        "endpoint": "https://jira.example.internal",
    },
    {
        "name": "GitHub",
        "status": "connected",
        "kind": "source-control",
        "owner": "platform-engineering",
        "endpoint": "https://github.com/example-org",
    },
    {
        "name": "Azure Monitor",
        "status": "connected",
        "kind": "observability",
        "owner": "sre",
        "endpoint": "https://monitor.azure.com",
    },
]

PROJECT_STORE: dict[str, dict[str, Any]] = {}
DB_PATH = os.getenv(
    "ORCHESTRATOR_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "orchestrator.db"),
)


def _database_path() -> str:
    path = os.path.abspath(DB_PATH)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def _connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_database_path())
    conn.row_factory = sqlite3.Row
    return conn


def _initialize_database() -> None:
    with _connect_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


def _hydrate_project_store() -> None:
    PROJECT_STORE.clear()
    with _connect_db() as conn:
        rows = conn.execute("SELECT payload FROM projects ORDER BY created_at ASC").fetchall()
    for row in rows:
        project = json.loads(row["payload"])
        PROJECT_STORE[project["id"]] = project


def _save_project(project: dict[str, Any]) -> None:
    with _connect_db() as conn:
        conn.execute(
            """
            INSERT INTO projects (id, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (
                project["id"],
                json.dumps(project, sort_keys=True),
                project["created_at"],
                project["updated_at"],
            ),
        )


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Agent registry (Option C: register running agents by URL; no code generation)
# ---------------------------------------------------------------------------

AGENT_STORE: dict[str, dict[str, Any]] = {}

SKILL_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$")
# BRD 9.2: L4 (fully autonomous) is not permitted.
AUTONOMY_LEVELS = ["L0", "L1", "L2", "L3"]
# BRD NFR-02: at least 20 concurrent Developer agents per team.
MAX_POOL_INSTANCES = 20
AGENT_HTTP_TIMEOUT_SECONDS = 5.0

ORCHESTRATOR_CARD: dict[str, Any] = {
    "name": "SDLC Orchestrator",
    "description": "Deterministic control plane: agent registry, workflow routing and approval gates.",
    "version": "0.2.0",
    "provider": "internal",
    "supportedInterfaces": ["json-rpc-http", "rest"],
    "capabilities": {"streaming": True, "pushNotifications": False},
    "skills": [
        {"id": "project.intake", "name": "Project Intake", "description": "Create and validate a project charter.", "tags": ["project", "intake"]},
        {"id": "project.state", "name": "Project State", "description": "Manage transitions for the SDLC workflow.", "tags": ["project", "state"]},
        {"id": "task.route", "name": "Task Route", "description": "Route work to the registered agent that owns a skill.", "tags": ["routing"]},
        {"id": "gate.enforce", "name": "Gate Enforce", "description": "Block work until human gate approvals are recorded.", "tags": ["governance"]},
        {"id": "governance.review", "name": "Governance Review", "description": "Review a project against governance policy.", "tags": ["governance"]},
    ],
    "securitySchemes": [],
}

# The orchestrator is the routing agent. Every other agent is registered through
# the console's Agent registry, but routing cannot work without this one, so it
# is always registered by default and kept in sync with the card above.
ORCHESTRATOR_AGENT_ID = "sdlc_orchestrator"


def _orchestrator_agent_record() -> dict[str, Any]:
    return {
        "id": ORCHESTRATOR_AGENT_ID,
        "name": ORCHESTRATOR_CARD["name"],
        "role": ORCHESTRATOR_CARD["description"],
        "version": ORCHESTRATOR_CARD["version"],
        "url": os.getenv("ORCHESTRATOR_PUBLIC_URL", "http://orchestrator:8000"),
        "skills": [skill["id"] for skill in ORCHESTRATOR_CARD["skills"]],
        "autonomy": "L0",
        "status": "online",
        "tools": ["Agent Registry", "Workflow State", "Approval Gates"],
        "instances": 1,
        "max_instances": 1,
        "system": True,
    }


def _save_agent(agent: dict[str, Any]) -> None:
    with _connect_db() as conn:
        conn.execute(
            """
            INSERT INTO agents (id, payload, created_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
            """,
            (agent["id"], json.dumps(agent, sort_keys=True), _timestamp()),
        )


def _seed_default_agents() -> None:
    _save_agent(_orchestrator_agent_record())


def _hydrate_agent_store() -> None:
    AGENT_STORE.clear()
    with _connect_db() as conn:
        rows = conn.execute("SELECT payload FROM agents ORDER BY created_at ASC").fetchall()
    agents = [json.loads(row["payload"]) for row in rows]
    # System agents first, then in registration order.
    for agent in sorted(agents, key=lambda item: not item.get("system", False)):
        AGENT_STORE[agent["id"]] = agent


def _slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", value.strip()).strip("_").lower() or "agent"


def _normalize_agent_url(raw_url: str) -> str:
    url = raw_url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail={"message": "Agent URL must start with http:// or https://"})
    return url


def _fetch_agent_card(url: str) -> dict[str, Any]:
    """Fetch an agent's A2A Agent Card. Patched in tests."""
    response = httpx.get(f"{url}/.well-known/agent-card.json", timeout=AGENT_HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


def _check_agent_health(url: str) -> bool:
    """Return True when the agent's /health endpoint answers OK. Patched in tests."""
    try:
        response = httpx.get(f"{url}/health", timeout=AGENT_HTTP_TIMEOUT_SECONDS)
        return response.status_code == 200
    except httpx.HTTPError:
        return False


def _load_and_validate_card(url: str) -> dict[str, Any]:
    try:
        card = _fetch_agent_card(url)
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail={"message": f"Could not fetch an Agent Card from {url}/.well-known/agent-card.json ({exc.__class__.__name__})."},
        ) from exc

    problems: list[str] = []
    if not isinstance(card, dict):
        raise HTTPException(status_code=422, detail={"message": "Agent Card must be a JSON object."})
    name = str(card.get("name") or "").strip()
    version = str(card.get("version") or "").strip()
    if not name:
        problems.append("missing 'name'")
    if not version:
        problems.append("missing 'version'")

    skills = card.get("skills") if isinstance(card.get("skills"), list) else []
    if not skills:
        problems.append("must declare at least one skill")
    skill_details: list[dict[str, str]] = []
    for skill in skills:
        skill_id = str(skill.get("id") or "") if isinstance(skill, dict) else ""
        if not SKILL_ID_PATTERN.match(skill_id):
            problems.append(f"skill id '{skill_id}' must follow <domain>.<action>")
            continue
        skill_details.append(
            {"id": skill_id, "name": str(skill.get("name") or skill_id), "description": str(skill.get("description") or "")}
        )

    if problems:
        raise HTTPException(status_code=422, detail={"message": "Invalid Agent Card: " + "; ".join(problems) + "."})

    pool = card.get("x-pool") if isinstance(card.get("x-pool"), dict) else {}
    max_instances = pool.get("maxInstances", 1)
    if not isinstance(max_instances, int) or max_instances < 1:
        max_instances = 1

    return {
        "name": name,
        "description": str(card.get("description") or "").strip(),
        "version": version,
        "skills": skill_details,
        "max_instances": min(max_instances, MAX_POOL_INSTANCES),
    }


_initialize_database()
_hydrate_project_store()
_seed_default_agents()
_hydrate_agent_store()


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., min_length=3)
    description: str | None = None
    owner: str | None = None
    budget: float | None = None
    timeline: str | None = None


class ProjectTransitionRequest(BaseModel):
    to: str = Field(..., min_length=2)
    note: str | None = None


class ProjectRouteRequest(BaseModel):
    phase: str = Field(..., min_length=3)


class ProjectApprovalRequest(BaseModel):
    approved: bool
    approver: str | None = None
    note: str | None = None


class AgentPreviewRequest(BaseModel):
    url: str = Field(..., min_length=8)


class AgentRegisterRequest(BaseModel):
    url: str = Field(..., min_length=8)
    autonomy: str = "L1"
    tools: list[str] = Field(default_factory=list)
    instances: int = Field(1, ge=1, le=MAX_POOL_INSTANCES)


# Each phase needs a skill; the registry decides which agent provides it.
PHASE_ROUTING: dict[str, str] = {
    "requirements": "requirements.draft",
    "analysis": "process.model",
    "design": "architecture.design",
    "planning": "project.plan",
    "delivery": "sprint.plan",
    "build": "story.implement",
    "test": "test.execute",
    "status": "status.report",
    "review": "governance.review",
}


def _find_agent_for_skill(skill: str) -> dict[str, Any] | None:
    candidates = [agent for agent in AGENT_STORE.values() if skill in agent.get("skills", [])]
    online = [agent for agent in candidates if agent.get("status") == "online"]
    return (online or candidates or [None])[0]


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "SDLC Orchestrator",
        "status": "ok",
        "mode": os.getenv("MODE", "real"),
        "docs": "/docs",
        "health": "/health",
        "agent_card": "/.well-known/agent-card.json",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "orchestrator",
        "mode": os.getenv("MODE", "real"),
    }


@app.get("/api/health")
def api_health() -> dict[str, Any]:
    return health()


@app.get("/.well-known/agent-card.json")
def agent_card() -> JSONResponse:
    return JSONResponse(content=ORCHESTRATOR_CARD)


@app.get("/api/projects")
def list_projects() -> list[dict[str, Any]]:
    return list(PROJECT_STORE.values())


@app.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    project = PROJECT_STORE.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"project_id": "Project not found"})
    return project


@app.get("/api/projects/{project_id}/state")
def get_project_state(project_id: str) -> dict[str, Any]:
    return get_project(project_id)


@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectCreateRequest) -> dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"name": "Project name is required"})

    project_id = uuid.uuid4().hex[:8]
    timestamp = _timestamp()
    budget = payload.budget
    initial_status = "validated" if budget is not None and budget < 20000 else "draft"
    project = {
        "id": project_id,
        "name": name,
        "description": payload.description or "",
        "owner": payload.owner or "unassigned",
        "budget": payload.budget,
        "timeline": payload.timeline or "not-set",
        "status": initial_status,
        "created_at": timestamp,
        "updated_at": timestamp,
        "history": [
            {
                "from": "new",
                "to": initial_status,
                "timestamp": timestamp,
                "note": "Project created and registered in workflow intake." if initial_status == "draft" else "Project created and automatically advanced to validation.",
            }
        ],
    }
    PROJECT_STORE[project_id] = project
    _save_project(project)
    return project


@app.post("/api/projects/{project_id}/transitions")
def transition_project(project_id: str, payload: ProjectTransitionRequest) -> dict[str, Any]:
    project = PROJECT_STORE.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"project_id": "Project not found"})

    target_state = payload.to.strip().lower()
    if not target_state:
        raise HTTPException(status_code=400, detail={"to": "Transition target is required"})

    current_state = project["status"]
    if target_state == current_state:
        return project

    allowed = ALLOWED_TRANSITIONS.get(current_state, [])
    if target_state not in allowed:
        raise HTTPException(
            status_code=400,
            detail={
                "transition": f"Status '{current_state}' cannot transition to '{target_state}'",
                "allowed": allowed,
            },
        )

    project["status"] = target_state
    project["updated_at"] = _timestamp()
    project["history"].append(
        {
            "from": current_state,
            "to": target_state,
            "timestamp": project["updated_at"],
            "note": payload.note or f"Workflow advanced to '{target_state}'.",
        }
    )
    _save_project(project)
    return project


@app.post("/api/projects/{project_id}/route")
def route_project(project_id: str, payload: ProjectRouteRequest) -> dict[str, Any]:
    project = PROJECT_STORE.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"project_id": "Project not found"})

    phase = payload.phase.strip().lower()
    if phase not in PHASE_ROUTING:
        raise HTTPException(status_code=400, detail={"phase": f"Unsupported routing phase '{payload.phase}'"})

    skill = PHASE_ROUTING[phase]
    budget = project.get("budget") or 0
    requires_approval = bool(budget >= 20000)
    approval_reason = "budget_over_20000" if requires_approval else None
    approval = project.get("approval")

    if requires_approval and (not approval or approval.get("approved") is not True):
        raise HTTPException(
            status_code=403,
            detail={
                "approval_required": True,
                "approval_reason": approval_reason,
                "message": "Governance approval is required before routing this project.",
            },
        )

    agent = _find_agent_for_skill(skill)
    if agent is None:
        raise HTTPException(
            status_code=503,
            detail={
                "skill": skill,
                "message": f"No registered agent provides skill '{skill}'. Register one in the Agent registry.",
            },
        )

    handoff = {
        "agent": agent["name"],
        "agent_id": agent["id"],
        "agent_url": agent.get("url"),
        "skill": skill,
        "project_id": project_id,
        "project_name": project["name"],
        "owner": project["owner"],
        "status": project["status"],
        "phase": phase,
        "payload": {
            "phase": phase,
            "project_id": project_id,
            "project_name": project["name"],
            "owner": project["owner"],
            "budget": project.get("budget"),
            "timeline": project.get("timeline"),
            "description": project.get("description", ""),
            "approval": project.get("approval"),
        },
    }

    return {
        "project_id": project_id,
        "phase": phase,
        "status": project["status"],
        "next_agent": agent["name"],
        "next_agent_id": agent["id"],
        "next_step": skill,
        "requires_approval": requires_approval,
        "approval_reason": approval_reason,
        "handoff": handoff,
    }


@app.post("/api/projects/{project_id}/approval")
def project_approval(project_id: str, payload: ProjectApprovalRequest) -> dict[str, Any]:
    project = PROJECT_STORE.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"project_id": "Project not found"})

    decision = "approved" if payload.approved else "rejected"
    prior_status = project["status"]
    if payload.approved and project["status"] == "draft":
        project["status"] = "validated"
    elif not payload.approved and project["status"] == "draft":
        project["status"] = "rejected"

    project["approval"] = {
        "approved": payload.approved,
        "approver": payload.approver or "unknown",
        "note": payload.note or "Governance decision recorded.",
        "decision": decision,
        "timestamp": _timestamp(),
    }
    project["history"].append(
        {
            "from": prior_status,
            "to": project["status"],
            "timestamp": _timestamp(),
            "note": f"Governance decision: {decision} by {project['approval']['approver']}",
        }
    )
    project["updated_at"] = _timestamp()
    _save_project(project)

    return {
        "project_id": project_id,
        "approved": payload.approved,
        "approver": project["approval"]["approver"],
        "status": project["status"],
        "decision": decision,
        "note": project["approval"]["note"],
    }


@app.get("/api/projects/{project_id}/governance")
def governance_status(project_id: str) -> dict[str, Any]:
    project = PROJECT_STORE.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail={"project_id": "Project not found"})

    budget = project.get("budget") or 0
    return {
        "project_id": project_id,
        "pending_approval": budget >= 20000,
        "approval_reason": "budget_over_20000" if budget >= 20000 else None,
        "status": project["status"],
    }


@app.get("/api/agents")
def list_agents() -> list[dict[str, Any]]:
    return list(AGENT_STORE.values())


@app.post("/api/agents/preview")
def preview_agent(payload: AgentPreviewRequest) -> dict[str, Any]:
    """Fetch and validate an Agent Card without registering it."""
    url = _normalize_agent_url(payload.url)
    summary = _load_and_validate_card(url)
    return {**summary, "url": url, "healthy": _check_agent_health(url)}


@app.post("/api/agents", status_code=201)
def register_agent(payload: AgentRegisterRequest) -> dict[str, Any]:
    """Register an already-running agent by URL. The agent describes itself via its Agent Card."""
    url = _normalize_agent_url(payload.url)
    autonomy = payload.autonomy.strip().upper()
    if autonomy not in AUTONOMY_LEVELS:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Autonomy must be one of {', '.join(AUTONOMY_LEVELS)} (L4 is not permitted)."},
        )

    summary = _load_and_validate_card(url)
    agent_id = _slugify(summary["name"])

    for existing in AGENT_STORE.values():
        if existing.get("url") == url:
            raise HTTPException(status_code=409, detail={"message": f"{url} is already registered as '{existing['name']}'."})
        if existing["id"] == agent_id or existing["name"].casefold() == summary["name"].casefold():
            raise HTTPException(status_code=409, detail={"message": f"An agent named '{existing['name']}' is already registered."})

    if payload.instances > summary["max_instances"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"'{summary['name']}' supports at most {summary['max_instances']} instance(s) "
                "(declared by x-pool.maxInstances in its Agent Card)."
            },
        )

    timestamp = _timestamp()
    record = {
        "id": agent_id,
        "name": summary["name"],
        "role": summary["description"],
        "version": summary["version"],
        "url": url,
        "skills": [skill["id"] for skill in summary["skills"]],
        "skill_details": summary["skills"],
        "autonomy": autonomy,
        "tools": [tool.strip() for tool in payload.tools if tool.strip()],
        "instances": payload.instances,
        "max_instances": summary["max_instances"],
        "status": "online" if _check_agent_health(url) else "offline",
        "registered_at": timestamp,
        "last_checked": timestamp,
        "system": False,
    }
    AGENT_STORE[agent_id] = record
    _save_agent(record)
    return record


@app.post("/api/agents/{agent_id}/refresh")
def refresh_agent(agent_id: str) -> dict[str, Any]:
    """Re-read the Agent Card and health of a registered agent."""
    agent = AGENT_STORE.get(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail={"message": "Agent not found"})
    if agent.get("system"):
        return agent

    try:
        summary = _load_and_validate_card(agent["url"])
    except HTTPException:
        agent["status"] = "offline"
    else:
        agent.update(
            role=summary["description"],
            version=summary["version"],
            skills=[skill["id"] for skill in summary["skills"]],
            skill_details=summary["skills"],
            max_instances=summary["max_instances"],
            status="online" if _check_agent_health(agent["url"]) else "offline",
        )
    agent["last_checked"] = _timestamp()
    _save_agent(agent)
    return agent


@app.get("/api/runtime/config")
def runtime_config() -> dict[str, Any]:
    environment = os.getenv("APP_ENV", "local")
    secret_key = os.getenv("APP_SECRET_KEY")
    database_path = os.getenv("ORCHESTRATOR_DB_PATH", _database_path())
    return {
        "environment": environment,
        "mode": os.getenv("MODE", "real"),
        "db_path": database_path,
        "containerized": os.getenv("DOCKER_CONTAINER", "false").lower() in {"1", "true", "yes"},
        "secret_configured": bool(secret_key),
        "ready": bool(secret_key) or environment in {"local", "dev"},
    }


@app.get("/api/deployment/status")
def deployment_status() -> dict[str, Any]:
    config = runtime_config()
    status = "ready" if config["ready"] else "needs-attention"
    return {
        "status": status,
        "environment": config["environment"],
        "containerized": config["containerized"],
        "database_ready": True,
        "secrets_configured": config["secret_configured"],
        "last_verified": _timestamp(),
    }


@app.get("/api/integrations")
def list_integrations() -> list[dict[str, Any]]:
    return INTEGRATIONS


@app.get("/api/observability/overview")
def observability_overview() -> dict[str, Any]:
    return {
        "status": "healthy",
        "trace_id": f"trace-{uuid.uuid4().hex[:12]}",
        "services": [
            {"name": "orchestrator", "status": "healthy", "latency_ms": 42},
            {"name": "po_agent", "status": "healthy", "latency_ms": 57},
            {"name": "sm_agent", "status": "healthy", "latency_ms": 65},
            {"name": "console", "status": "healthy", "latency_ms": 31},
        ],
        "alerts": 0,
        "uptime": "99.98%",
        "last_sync": _timestamp(),
    }
