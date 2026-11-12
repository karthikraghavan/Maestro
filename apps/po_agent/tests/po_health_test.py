from fastapi.testclient import TestClient

from apps.po_agent.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['service'] == 'po-agent'


def test_agent_card_endpoint():
    response = client.get('/.well-known/agent-card.json')
    assert response.status_code == 200
    payload = response.json()
    assert payload['name'] == 'Product Owner Agent'
    assert 'requirements.draft' in {skill['id'] for skill in payload['skills']}
