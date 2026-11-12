from fastapi.testclient import TestClient

from apps.sm_agent.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['service'] == 'sm-agent'


def test_agent_card_endpoint():
    response = client.get('/.well-known/agent-card.json')
    assert response.status_code == 200
    payload = response.json()
    assert payload['name'] == 'Scrum Master Agent'
    assert 'team.propose' in {skill['id'] for skill in payload['skills']}
