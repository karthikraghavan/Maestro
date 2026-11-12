# SDLC A2A Agent Team Runbook

This runbook explains how to start, verify, diagnose, and stop the local SDLC agent system quickly.

## 1. Prerequisites

Before you start, make sure you have:

- Python 3.11+
- Docker Desktop or Docker Engine running
- Node.js and npm for the console if you want local frontend dev work outside Docker
- Access to the project directory

## 2. Start from the repo root

```bash
cd /Users/karthikvishwanathraghavan/Documents/Applied AI/AI Agents/A2A/a2a-framework
```

Create a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Start the full stack with Docker Compose:

```bash
docker compose up --build -d
```

If you want to see logs live:

```bash
docker compose logs -f
```

## 3. Service URLs

After startup, these are the primary endpoints:

- Orchestrator: http://localhost:8000
- Product Owner agent: http://localhost:8101
- Scrum Master agent: http://localhost:8102
- Governance Console: http://localhost:5173
- Jaeger UI: http://localhost:16686

## 4. Smoke tests

Check the orchestrator:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/.well-known/agent-card.json
```

Check the specialist agents:

```bash
curl http://localhost:8101/health
curl http://localhost:8101/.well-known/agent-card.json
curl http://localhost:8102/health
curl http://localhost:8102/.well-known/agent-card.json
```

Check the console page:

```bash
curl -I http://localhost:5173
```

## 5. Quick project flow test

Create a project through the orchestrator:

```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Sprint",
    "description": "Need sprint planning",
    "owner": "product-team",
    "budget": 18000,
    "timeline": "2026-Q4"
  }'
```

Route the project:

```bash
curl -X POST http://localhost:8000/api/projects/{project_id}/route \
  -H "Content-Type: application/json" \
  -d '{"phase":"requirements"}'
```

Approve a high-budget project:

```bash
curl -X POST http://localhost:8000/api/projects/{project_id}/approval \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "approver": "governance-console",
    "note": "Approved for execution"
  }'
```

## 5a. Adding a new agent

Agents are built in the repo and registered by URL. The orchestrator never generates code. Only the SDLC Orchestrator is registered by default.

1. Scaffold the service offline, review it in VS Code, and commit it:

   ```bash
   python scripts/new_agent.py --name "UX Designer Agent" --slug ux_agent --port 8109 \
     --description "Produces user flows and UI specs." \
     --skill "ux.flow|UX Flow|Produce user flows." \
     --skill "ui.spec|UI Spec|Produce UI specifications."
   ```

   Identity and skills live in `apps/<slug>/app/agent_card.json`. Skill IDs must follow `<domain>.<action>`. For a scalable pool such as Developer or QA, pass `--max-instances N`.

2. Start the service: `docker compose up --build -d ux-agent`
3. In the console, go to **Agent registry → Onboard agent**, enter `http://ux-agent:8109`, click **Fetch card**, choose the autonomy level, instances and tools, then click **Register agent**.

The orchestrator routes each workflow phase to whichever registered agent advertises the required skill (see `PHASE_ROUTING` in `apps/orchestrator/app/main.py`). Re-read an agent's card after a redeploy with `POST /api/agents/{id}/refresh`.

## 6. Validate with tests

Run the orchestrator contract tests:

```bash
cd /Users/karthikvishwanathraghavan/Documents/Applied AI/AI Agents/A2A/a2a-framework
pytest apps/orchestrator/tests/orchestrator_health_test.py -q
```

Run the frontend tests:

```bash
cd /Users/karthikvishwanathraghavan/Documents/Applied AI/AI Agents/A2A/a2a-framework/apps/console
npm test -- --run
```

Build the console:

```bash
npm run build
```

## 7. Troubleshooting

### Docker compose fails to start

Check Docker is running:

```bash
docker compose version
```

Then inspect container status:

```bash
docker compose ps
```

If needed, read logs:

```bash
docker compose logs orchestrator
```

### Service is not responding

Check the health endpoint directly:

```bash
curl http://localhost:8000/health
```

If unhealthy, inspect the service log:

```bash
docker compose logs --tail=100 orchestrator
```

### Frontend cannot reach backend

Verify the orchestrator is running and CORS is enabled in the backend. The app expects the backend at localhost:8000.

### Test failures

Run the specific failing test or test file first, then fix the root cause before broad changes.

## 8. Stop the stack

Stop running services:

```bash
docker compose down
```

To remove volumes and reset state:

```bash
docker compose down -v
```

## 9. Where to start debugging

If you are new to the repo, start here:

1. [docker-compose.yml](docker-compose.yml) — defines the runtime topology
2. [apps/orchestrator/app/main.py](apps/orchestrator/app/main.py) — orchestrator logic and control plane
3. [apps/console/src/App.tsx](apps/console/src/App.tsx) — governance console UI
4. [apps/orchestrator/tests/orchestrator_health_test.py](apps/orchestrator/tests/orchestrator_health_test.py) — contract and behavior checks

## 10. Typical developer workflow

1. Start Docker Compose
2. Open the console at localhost:5173
3. Hit orchestrator health and project APIs
4. Create or route a project
5. Validate transitions and approvals
6. Use Jaeger for trace inspection if needed
7. Re-run tests before making broader changes

## 11. Notes

- The repo is intended to be local-first and mock-friendly.
- The orchestrator owns workflow decisions.
- The console is a human oversight layer rather than the source of truth.
- Persistence is now handled by a local SQLite database for project records and workflow history.
