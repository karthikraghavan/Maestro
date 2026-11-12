# A2A SDLC Agent Team

This repository is the Phase 1 scaffold for the A2A SDLC agent team.

## Milestone 1 delivered

- repo layout for the orchestrator, Governance Console, Product Owner agent, and Scrum Master agent
- Docker Compose stack with all services and Jaeger
- health endpoints on every backend service
- Agent Card discovery endpoints for each service
- mock-mode default configuration
- basic Python smoke tests and a frontend smoke test

## Services

- Orchestrator: http://localhost:8000
- Product Owner agent: http://localhost:8101
- Scrum Master agent: http://localhost:8102
- Governance Console: http://localhost:5173
- Jaeger UI: http://localhost:16686

## Run locally

```bash
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
docker compose up --build
```

## Smoke checks

```bash
curl http://localhost:8000/health
curl http://localhost:8000/.well-known/agent-card.json
curl http://localhost:8101/health
curl http://localhost:8101/.well-known/agent-card.json
curl http://localhost:8102/health
curl http://localhost:8102/.well-known/agent-card.json
```

This repository intentionally stops after Milestone 1, as requested.
