import importlib

import httpx
import pytest
from fastapi.testclient import TestClient

import apps.orchestrator.app.main as main_module

PO_URL = 'http://po-agent:8101'
SM_URL = 'http://sm-agent:8102'
DEV_URL = 'http://developer-agent:8107'
DOWN_URL = 'http://down-agent:9999'

FAKE_CARDS = {
    PO_URL: {
        'name': 'Product Owner Agent',
        'description': 'Drafts epics and stories.',
        'version': '0.1.0',
        'skills': [{'id': 'requirements.draft', 'name': 'Requirements Draft'}],
    },
    SM_URL: {
        'name': 'Scrum Master Agent',
        'description': 'Plans sprints.',
        'version': '0.1.0',
        'skills': [{'id': 'sprint.plan'}, {'id': 'status.report'}],
    },
    DEV_URL: {
        'name': 'Developer Agent',
        'description': 'Implements stories.',
        'version': '0.1.0',
        'skills': [{'id': 'story.implement'}],
        'x-pool': {'scalable': True, 'maxInstances': 20},
    },
}


def _fake_fetch(url):
    if url not in FAKE_CARDS:
        raise httpx.ConnectError('unreachable')
    return FAKE_CARDS[url]


def _reload(tmp_path, monkeypatch):
    """Reload the app against a temp DB with agent HTTP calls stubbed out."""
    monkeypatch.setenv('ORCHESTRATOR_DB_PATH', str(tmp_path / 'orchestrator.db'))
    importlib.reload(main_module)
    monkeypatch.setattr(main_module, '_fetch_agent_card', _fake_fetch)
    monkeypatch.setattr(main_module, '_check_agent_health', lambda url: url in FAKE_CARDS)
    return TestClient(main_module.app)


@pytest.fixture
def client(tmp_path, monkeypatch):
    return _reload(tmp_path, monkeypatch)


def _register(client, url, **extra):
    return client.post('/api/agents', json={'url': url, **extra})


def _validated_project(client, **fields):
    project_id = client.post('/api/projects', json={'owner': 'team', **fields}).json()['id']
    client.post(f'/api/projects/{project_id}/transitions', json={'to': 'validated'})
    return project_id


# --- service basics -------------------------------------------------------

def test_health_endpoint(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_agent_card_endpoint(client):
    response = client.get('/.well-known/agent-card.json')
    assert response.status_code == 200
    payload = response.json()
    assert payload['name'] == 'SDLC Orchestrator'
    assert 'project.intake' in {skill['id'] for skill in payload['skills']}


# --- projects -------------------------------------------------------------

def test_create_project_registers_new_workflow(client):
    response = client.post(
        '/api/projects',
        json={'name': 'AI Sprint Planner', 'description': 'Sprint planning.', 'owner': 'product-team', 'budget': 15000, 'timeline': '2026-Q4'},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload['name'] == 'AI Sprint Planner'
    assert payload['status'] == 'validated'
    assert 'id' in payload


def test_approval_advances_draft_projects_to_validated(client):
    project_id = client.post('/api/projects', json={'name': 'Budget Guard Project', 'owner': 'exec-team', 'budget': 25000}).json()['id']
    approval = client.post(f'/api/projects/{project_id}/approval', json={'approved': True, 'approver': 'risk-board'})
    assert approval.status_code == 200
    assert approval.json()['status'] == 'validated'
    assert approval.json()['decision'] == 'approved'


def test_project_transition_updates_state(client):
    project_id = client.post('/api/projects', json={'name': 'Governance Dashboard', 'owner': 'platform-team'}).json()['id']
    response = client.post(f'/api/projects/{project_id}/transitions', json={'to': 'validated'})
    assert response.status_code == 200
    assert response.json()['status'] == 'validated'
    assert any(event['to'] == 'validated' for event in response.json()['history'])


def test_invalid_project_name_is_rejected(client):
    response = client.post('/api/projects', json={'name': '   ', 'owner': 'team'})
    assert response.status_code == 400
    assert 'name' in response.json()['detail']


def test_project_store_persists_across_app_reload(tmp_path, monkeypatch):
    first = _reload(tmp_path, monkeypatch)
    project_id = first.post('/api/projects', json={'name': 'Persistent Platform', 'owner': 'platform-team', 'budget': 18000}).json()['id']
    second = _reload(tmp_path, monkeypatch)
    assert any(project['id'] == project_id for project in second.get('/api/projects').json())


# --- agent registry -------------------------------------------------------

def test_orchestrator_agent_is_registered_by_default(client):
    agents = client.get('/api/agents').json()
    assert len(agents) == 1
    assert agents[0]['id'] == 'sdlc_orchestrator'
    assert agents[0]['system'] is True
    assert 'task.route' in agents[0]['skills']


def test_register_agent_reads_identity_from_agent_card(client):
    response = _register(client, PO_URL + '/', autonomy='l1', tools=['Jira', ' '])
    assert response.status_code == 201
    agent = response.json()
    assert agent['id'] == 'product_owner_agent'
    assert agent['name'] == 'Product Owner Agent'
    assert agent['url'] == PO_URL
    assert agent['skills'] == ['requirements.draft']
    assert agent['autonomy'] == 'L1'
    assert agent['tools'] == ['Jira']
    assert agent['status'] == 'online'


def test_preview_does_not_register(client):
    preview = client.post('/api/agents/preview', json={'url': SM_URL})
    assert preview.status_code == 200
    assert preview.json()['name'] == 'Scrum Master Agent'
    assert len(client.get('/api/agents').json()) == 1


def test_duplicate_registration_is_rejected(client):
    assert _register(client, PO_URL).status_code == 201
    assert _register(client, PO_URL).status_code == 409


def test_unreachable_agent_cannot_be_registered(client):
    response = _register(client, DOWN_URL)
    assert response.status_code == 502
    assert 'Agent Card' in response.json()['detail']['message']


def test_invalid_skill_ids_are_rejected(client):
    FAKE_CARDS['http://bad-agent:1'] = {'name': 'Bad Agent', 'version': '1', 'skills': [{'id': 'NoDomain'}]}
    try:
        response = _register(client, 'http://bad-agent:1')
    finally:
        del FAKE_CARDS['http://bad-agent:1']
    assert response.status_code == 422
    assert '<domain>.<action>' in response.json()['detail']['message']


def test_l4_autonomy_is_not_permitted(client):
    response = _register(client, PO_URL, autonomy='L4')
    assert response.status_code == 400


def test_instances_are_limited_by_agent_card(client):
    assert _register(client, PO_URL, instances=3).status_code == 400
    response = _register(client, DEV_URL, instances=3)
    assert response.status_code == 201
    assert response.json()['instances'] == 3
    assert response.json()['max_instances'] == 20


def test_registered_agents_persist_and_seed_is_not_duplicated(tmp_path, monkeypatch):
    first = _reload(tmp_path, monkeypatch)
    _register(first, PO_URL)
    second = _reload(tmp_path, monkeypatch)
    assert [agent['id'] for agent in second.get('/api/agents').json()] == ['sdlc_orchestrator', 'product_owner_agent']


def test_refresh_marks_unreachable_agent_offline(client, monkeypatch):
    _register(client, PO_URL)
    monkeypatch.setattr(main_module, '_fetch_agent_card', lambda url: (_ for _ in ()).throw(httpx.ConnectError('down')))
    response = client.post('/api/agents/product_owner_agent/refresh')
    assert response.status_code == 200
    assert response.json()['status'] == 'offline'


# --- routing --------------------------------------------------------------

def test_high_budget_projects_require_governance_approval_before_routing(client):
    _register(client, PO_URL)
    project_id = _validated_project(client, name='Enterprise Platform', budget=25000)

    blocked = client.post(f'/api/projects/{project_id}/route', json={'phase': 'requirements'})
    assert blocked.status_code == 403
    assert blocked.json()['detail']['approval_required'] is True

    client.post(f'/api/projects/{project_id}/approval', json={'approved': True, 'approver': 'risk-board'})
    routed = client.post(f'/api/projects/{project_id}/route', json={'phase': 'requirements'})
    assert routed.status_code == 200
    payload = routed.json()
    assert payload['next_agent'] == 'Product Owner Agent'
    assert payload['requires_approval'] is True
    assert payload['approval_reason'] == 'budget_over_20000'


def test_route_resolves_agent_by_skill_from_registry(client):
    _register(client, SM_URL)
    project_id = _validated_project(client, name='Delivery Handoff', budget=12000)

    routed = client.post(f'/api/projects/{project_id}/route', json={'phase': 'delivery'})
    assert routed.status_code == 200
    handoff = routed.json()['handoff']
    assert handoff['agent'] == 'Scrum Master Agent'
    assert handoff['agent_url'] == SM_URL
    assert handoff['skill'] == 'sprint.plan'
    assert handoff['payload']['phase'] == 'delivery'


def test_route_fails_clearly_when_no_agent_has_the_skill(client):
    project_id = _validated_project(client, name='Nobody Home', budget=1000)
    routed = client.post(f'/api/projects/{project_id}/route', json={'phase': 'build'})
    assert routed.status_code == 503
    assert routed.json()['detail']['skill'] == 'story.implement'


def test_review_phase_routes_to_the_orchestrator(client):
    project_id = _validated_project(client, name='Review Me', budget=1000)
    routed = client.post(f'/api/projects/{project_id}/route', json={'phase': 'review'})
    assert routed.status_code == 200
    assert routed.json()['next_agent'] == 'SDLC Orchestrator'


def test_invalid_phase_is_rejected_by_router(client):
    project_id = _validated_project(client, name='Unknown Stage Project')
    routed = client.post(f'/api/projects/{project_id}/route', json={'phase': 'not-a-valid-phase'})
    assert routed.status_code == 400
    assert 'phase' in routed.json()['detail']


# --- platform endpoints ---------------------------------------------------

def test_tool_integrations_and_observability_are_exposed(client):
    integrations = client.get('/api/integrations').json()
    assert any(item['name'] == 'Jira' for item in integrations)
    health = client.get('/api/observability/overview').json()
    assert {'trace_id', 'services', 'status'} <= health.keys()


def test_runtime_configuration_and_deployment_readiness_are_exposed(client):
    payload = client.get('/api/runtime/config').json()
    assert payload['environment'] in {'local', 'dev', 'prod'}
    assert 'db_path' in payload
    deployment = client.get('/api/deployment/status').json()
    assert 'ready' in deployment['status'] or 'healthy' in deployment['status']
