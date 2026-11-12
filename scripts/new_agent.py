"""Offline scaffolder for a new A2A agent service.

Run from the repo root, review the generated files in VS Code, then commit:

    python scripts/new_agent.py --name "Business Analyst Agent" --slug ba_agent --port 8104 \
        --description "Elicits process flows and business rules." \
        --skill "process.model|Process Model|Document current and future-state process flows."

Then start it with `docker compose up --build -d <service>` and register it in the
console's Agent registry using its URL (for example http://ba-agent:8104).

The Agent Card lives in app/agent_card.json, so editing an agent's identity or
skills never means editing Python source.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
APPS_ROOT = REPO_ROOT / "apps"
COMPOSE_PATH = REPO_ROOT / "docker-compose.yml"
SKILL_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$")
SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")

MAIN_TEMPLATE = '''import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

CARD: dict[str, Any] = json.loads(Path(__file__).with_name("agent_card.json").read_text(encoding="utf-8"))
SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "{service}")

app = FastAPI(title=CARD["name"], version=CARD["version"])


@app.get("/health")
def health() -> dict[str, Any]:
    return {{"status": "ok", "service": SERVICE_NAME, "mode": os.getenv("MODE", "mock")}}


@app.get("/.well-known/agent-card.json")
def agent_card() -> JSONResponse:
    return JSONResponse(content=CARD)


@app.get("/api/ready")
def ready() -> dict[str, str]:
    return {{"status": "ready", "service": SERVICE_NAME}}
'''

TEST_TEMPLATE = '''from fastapi.testclient import TestClient

from apps.{slug}.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_agent_card_declares_valid_skills():
    card = client.get("/.well-known/agent-card.json").json()
    assert card["name"] == {name!r}
    assert card["skills"], "an agent must declare at least one skill"
    for skill in card["skills"]:
        domain, _, action = skill["id"].partition(".")
        assert domain and action, f"skill id {{skill['id']!r}} must follow <domain>.<action>"
'''

DOCKERFILE_TEMPLATE = """FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE {port}

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "{port}"]
"""

REQUIREMENTS = "fastapi==0.115.6\nuvicorn[standard]==0.32.1\npydantic==2.11.3\n"


def _parse_skill(raw: str) -> dict[str, object]:
    parts = [part.strip() for part in raw.split("|")]
    skill_id = parts[0]
    if not SKILL_ID_PATTERN.match(skill_id):
        raise SystemExit(f"Skill id '{skill_id}' must follow <domain>.<action>, e.g. requirements.draft")
    name = parts[1] if len(parts) > 1 and parts[1] else skill_id
    description = parts[2] if len(parts) > 2 else ""
    return {"id": skill_id, "name": name, "description": description, "tags": skill_id.split(".")}


def _used_host_ports(compose_text: str) -> set[int]:
    return {int(match) for match in re.findall(r'"(\d+):\d+"', compose_text)}


def _compose_block(slug: str, service: str, port: int) -> str:
    return (
        f"  {service}:\n"
        f"    build:\n"
        f"      context: ./apps/{slug}\n"
        f"      dockerfile: Dockerfile\n"
        f"    container_name: sdlc-{service}\n"
        f"    ports:\n"
        f'      - "{port}:{port}"\n'
        f"    environment:\n"
        f"      MODE: mock\n"
        f"      PORT: {port}\n"
        f"      OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4318\n"
        f"      OTEL_SERVICE_NAME: {service}\n"
        f"    depends_on:\n"
        f"      - jaeger\n\n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", required=True, help='Display name, e.g. "Business Analyst Agent"')
    parser.add_argument("--slug", required=True, help="Folder name under apps/, e.g. ba_agent")
    parser.add_argument("--port", required=True, type=int, help="Host and container port")
    parser.add_argument("--description", required=True)
    parser.add_argument("--skill", action="append", required=True, help='"id|Name|Description" (repeatable)')
    parser.add_argument("--max-instances", type=int, default=1, help="Pool size the agent supports (x-pool.maxInstances)")
    parser.add_argument("--version", default="0.1.0")
    args = parser.parse_args(argv)

    if not SLUG_PATTERN.match(args.slug):
        raise SystemExit("--slug must be lowercase letters, digits and underscores, starting with a letter")
    agent_dir = APPS_ROOT / args.slug
    if agent_dir.exists():
        raise SystemExit(f"{agent_dir.relative_to(REPO_ROOT)} already exists")

    compose_text = COMPOSE_PATH.read_text(encoding="utf-8")
    service = args.slug.replace("_", "-")
    if args.port in _used_host_ports(compose_text):
        raise SystemExit(f"Port {args.port} is already used in docker-compose.yml")
    if f"\n  {service}:\n" in compose_text:
        raise SystemExit(f"Service '{service}' already exists in docker-compose.yml")

    card: dict[str, object] = {
        "name": args.name,
        "description": args.description,
        "version": args.version,
        "provider": "internal",
        "supportedInterfaces": ["json-rpc-http"],
        "capabilities": {"streaming": True, "pushNotifications": False},
        "skills": [_parse_skill(raw) for raw in args.skill],
        "securitySchemes": [],
    }
    if args.max_instances > 1:
        card["x-pool"] = {"scalable": True, "maxInstances": args.max_instances}

    (agent_dir / "app").mkdir(parents=True)
    (agent_dir / "tests").mkdir()
    (agent_dir / "__init__.py").write_text("", encoding="utf-8")
    (agent_dir / "app" / "__init__.py").write_text("", encoding="utf-8")
    (agent_dir / "app" / "main.py").write_text(MAIN_TEMPLATE.format(service=service), encoding="utf-8")
    (agent_dir / "app" / "agent_card.json").write_text(json.dumps(card, indent=2) + "\n", encoding="utf-8")
    (agent_dir / "tests" / f"{args.slug}_test.py").write_text(TEST_TEMPLATE.format(slug=args.slug, name=args.name), encoding="utf-8")
    (agent_dir / "Dockerfile").write_text(DOCKERFILE_TEMPLATE.format(port=args.port), encoding="utf-8")
    (agent_dir / "requirements.txt").write_text(REQUIREMENTS, encoding="utf-8")

    anchor = "  console:\n"
    block = _compose_block(args.slug, service, args.port)
    compose_text = compose_text.replace(anchor, block + anchor, 1) if anchor in compose_text else compose_text.rstrip() + "\n\n" + block
    COMPOSE_PATH.write_text(compose_text, encoding="utf-8")

    print(f"Created apps/{args.slug} and compose service '{service}' on port {args.port}.")
    print(f"Next: docker compose up --build -d {service}")
    print(f"Then register it in the Agent registry with URL http://{service}:{args.port}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
