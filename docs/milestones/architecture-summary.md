# SDLC A2A Agent Team: Milestone Architecture Summary

This document records the technical architecture, component structure, runtime flow, and purpose of each service across the planned milestones of the SDLC agent team.

---

## 1. System overview

The platform is a multi-service, local-first A2A system designed around a deterministic orchestration layer rather than a single monolithic agent. The core idea is:

- the orchestrator owns workflow state and coordination
- specialist agents own domain execution
- the Governance Console exposes business-facing status and approvals
- Docker Compose provides local runtime composition and networking
- Jaeger gives distributed trace visibility for workflow execution
- mock mode keeps the system runnable without external credentials or enterprise dependencies

### High-level runtime architecture

```text
Browser / User
    |
    v
Governance Console (React + Vite)
    |
    v
Orchestrator (FastAPI / control plane)
    |\
    | \__> Product Owner Agent
    | \__> Scrum Master Agent
    |
    +--> Jaeger (observability)
```

Each service exposes a health endpoint and an Agent Card, which lets the system register and discover capabilities in a portable way.

---

## 2. Milestone 1: Foundation, discovery, and local runtime scaffold

### Objective

Create the baseline repo structure, the local runtime topology, and the service contracts needed for future SDLC workflow orchestration.

### Technical architecture

Milestone 1 is intentionally a scaffold. It establishes the application boundaries and networking profile without implementing advanced logic.

#### Core components

1. Orchestrator
   - Purpose: central control plane and workflow coordinator
   - Stack: FastAPI + Uvicorn
   - Responsibility:
     - own health endpoint and Agent Card
     - expose project intake and state endpoints
     - later become the state machine and workflow router
   - Why it matters: it is the deterministic brain that decides which agent performs which task and when approvals are required.

2. Product Owner Agent
   - Purpose: requirement and backlog domain specialist
   - Stack: FastAPI + Uvicorn
   - Responsibility:
     - draft requirements and epics
     - prioritize backlog items
     - clarify stories and accept them
   - Why it matters: this agent owns the product-facing planning domain.

3. Scrum Master Agent
   - Purpose: delivery execution and team coordination specialist
   - Stack: FastAPI + Uvicorn
   - Responsibility:
     - propose team composition
     - plan sprint cadence
     - assign stories
     - produce status reports
     - resolve impediments
   - Why it matters: this agent owns operational delivery flow and service readiness.

4. Governance Console
   - Purpose: UI for oversight and approval workflows
   - Stack: React + Vite
   - Responsibility:
     - display workflow state and project health
     - surface approvals and escalations
     - act as the control surface for human-in-the-loop governance
   - Why it matters: it keeps the system understandable for humans and ensures people can validate or reject work.

5. Jaeger
   - Purpose: tracing and observability backend
   - Stack: Jaeger all-in-one
   - Responsibility:
     - collect service telemetry and request traces
     - help debug workflow timing and agent interactions
   - Why it matters: multi-agent systems need observability to see where latency or failure occurs.

6. Docker Compose network
   - Purpose: local service composition and network wiring
   - Responsibility:
     - define the app topology
     - map ports for each service
     - provide a single startup command for the local team
   - Why it matters: it keeps the environment reproducible and easy to run on any developer machine.

### Structure

The repository is organized by responsibility:

```text
apps/
  orchestrator/
  po_agent/
  sm_agent/
  console/
requirements.txt
docker-compose.yml
.env.example
README.md
```

Each app has its own entrypoint, health route, and Agent Card contract. This keeps the services loosely coupled while preserving a predictable interface model.

### Flow in Milestone 1

1. Docker Compose starts the network.
2. Each backend service boots under Uvicorn.
3. The service exposes `/health` and `/.well-known/agent-card.json`.
4. The Governance Console boots separately and serves the UI.
5. Jaeger starts in parallel to collect traces.
6. Smoke tests and curl checks validate that each service is reachable and contract-compliant.

### Purpose of Milestone 1

Milestone 1 is not business logic. It establishes the project skeleton and proves that:

- services can run together
- they expose discoverable capabilities
- the deployment model works
- the team can scale from a single repo into a multi-agent workflow system

---

## 3. Milestone 2: Orchestrator as the control plane

### Objective

Implement the actual project workflow engine in the orchestrator, establishing the decision-making layer for SDLC work.

### Technical architecture

Milestone 2 transforms the orchestrator from a health-only shell into the stateful runtime for the broader SDLC lifecycle.

#### Planned orchestrator responsibilities

1. Registry and service discovery
   - keep a local registry of active agents and their capabilities
   - discover valid operations by Agent Card metadata
   - map operations to agent responsibilities

2. Project intake and validation
   - accept project brief or charter input
   - validate required fields and constraints
   - normalize project metadata into a canonical internal model

3. State machine management
   - define lifecycle states such as proposed, validated, ready-for-PO, in-progress, gated, approved, blocked, and completed
   - ensure transitions only occur through explicit rules
   - maintain audit logs for every transition

4. Human approval gates
   - block progress until required approvals are granted
   - enforce budget, scope, risk, and change control criteria
   - expose pending tasks in the Governance Console

5. Routing logic
   - direct requirements drafting to the Product Owner agent
   - direct sprint planning and team proposals to the Scrum Master agent
   - route escalation and status flows based on state and policy

6. Audit and governance policy
   - keep a record of decisions, approvals, and exceptions
   - support kill-switch or emergency stop behaviors for risky workflow paths

### Structure

The orchestrator should evolve into a layered module pattern such as:

```text
apps/orchestrator/
  app/
    main.py
    models.py
    registry.py
    state_machine.py
    routing.py
    audit.py
    policy.py
    project_service.py
```

This decomposition keeps the decision logic separate from the HTTP layer and makes the workflow easier to test.

### Flow in Milestone 2

1. User submits a project charter or initiative request.
2. Orchestrator validates the incoming data.
3. It checks project constraints, risk, and expected delivery route.
4. It registers the project in the workflow state machine.
5. It routes the work to the Product Owner agent for requirements drafting.
6. The Product Owner returns epics, stories, and acceptance criteria.
7. The Scrum Master agent reviews team and sprint implications.
8. The orchestrator records the state transition and pending approval.
9. The console surfaces the approval queue for human review.

### Purpose of Milestone 2

Milestone 2 is where the repo becomes a real A2A control system. It turns the scaffold into an operating platform with explicit workflow logic, governance gates, and service-to-service coordination.

---

## 4. Milestone 3: Governance Console and approval workflows

### Objective

Give operators a working dashboard with human decision support and multi-stage workflow visibility.

### Technical architecture

The Governance Console becomes the front-end control surface for the SDLC lifecycle.

#### Planned console responsibilities

- display project portfolio state
- show pending approvals and blockers
- visualize workflow stages and completion status
- permit human override or rejection of an agent recommendation
- display traces and service health for each workflow

### Structure

```text
apps/console/
  src/
    App.tsx
    components/
    pages/
    services/
    hooks/
    types/
```

The app should interact with orchestrator APIs rather than contain critical workflow logic itself. The console is a control and visibility layer, not the source of truth.

### Flow in Milestone 3

1. Orchestrator publishes workflow state via REST endpoints.
2. The console polls or subscribes for updates.
3. A manager can review a project and approve or reject the next transition.
4. The approval event is sent back to the orchestrator.
5. The orchestrator advances or blocks state as appropriate.

### Purpose of Milestone 3

Human oversight is critical for enterprise-ready delivery. This milestone makes the system accountable, explainable, and manageable.

---

## 5. Milestone 4: Tool integration, observability, and production hardening

### Objective

Move from a local, mock-first system to a more operationally useful enterprise workflow platform.

### Technical architecture

This milestone adds real integrations and operational durability.

#### Planned enhancements

1. MCP and tool integrations
   - connect to Atlassian/Jira for backlog and sprint tracking
   - connect to GitHub or Azure DevOps for work item flows
   - support document ingestion or enterprise knowledge retrieval

2. Policy engine and risk checks
   - enforce security policy and compliance checks
   - guard against unsafe or unauthorized changes

3. Persistent storage
   - store project records, audit trails, and decisions
   - support workflow history and replayability

4. Observability and SRE controls
   - richer telemetry through OpenTelemetry
   - structured logs and trace correlation
   - health dashboards and alerting

5. Deployment readiness
   - secure environment configuration
   - production-friendly container settings
   - externalized secrets and runtime configuration

### Structure

```text
apps/
  orchestrator/
  po_agent/
  sm_agent/
  console/
  integrations/
  observability/
```

### Flow in Milestone 4

1. Work item and code repository data are retrieved from external systems.
2. Agents consume those signals and propose updates.
3. Orchestrator validates policy adherence and approval requirements.
4. State transitions are persisted and traced.
5. The console shows a clean operational status for business and engineering stakeholders.

### Purpose of Milestone 4

This milestone transforms the project from a local demo or prototype into a real governance and delivery platform that can be used with real enterprise tools and operational controls.

---

## 6. Cross-cutting design principles

The architecture is intentionally designed around a few clear principles:

- Deterministic control plane: the orchestrator owns work flow, not the LLM.
- Capability discovery: each agent advertises what it can do through Agent Cards.
- Human approval: governance remains in the loop for critical transitions.
- Traceable execution: every key action should be visible through logs and traces.
- Mock-first development: services should work without secrets during early development.
- Service isolation: specialist agents stay focused on a domain rather than performing unrelated orchestration tasks.

---

## 7. Milestone-to-component mapping

| Milestone | Main focus | Primary component | Secondary components |
|---|---|---|---|
| Milestone 1 | Scaffold and runtime contract | Orchestrator | PO agent, SM agent, console, Jaeger |
| Milestone 2 | Workflow orchestration and gating | Orchestrator | PO agent, SM agent |
| Milestone 3 | Human oversight and console UX | Governance Console | Orchestrator |
| Milestone 4 | Real integrations and production readiness | Orchestrator + integrations | Agents, traces, storage, dashboards |

---

## 8. Summary

The architecture follows a two-layer model:

- orchestration layer: orchestrator decides what happens and when
- specialist layer: agents perform domain-specific tasks
- UX layer: the console gives humans visibility and approval authority
- observability layer: Jaeger and logs make the whole system inspectable

This separation is what allows the project to scale from a toy multi-agent demo into an SDLC governance system without collapsing into a single brittle agent.
