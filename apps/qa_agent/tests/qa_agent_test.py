from fastapi.testclient import TestClient

from apps.qa_agent.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_agent_card_declares_valid_skills():
    card = client.get("/.well-known/agent-card.json").json()
    assert card["name"] == 'QA Agent'
    assert card["skills"], "an agent must declare at least one skill"
    for skill in card["skills"]:
        domain, _, action = skill["id"].partition(".")
        assert domain and action, f"skill id {skill['id']!r} must follow <domain>.<action>"
