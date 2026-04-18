"""Shared test fixtures for backend tests."""

from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from server.main import create_app
from server.store import ConversationStore


@pytest.fixture
def store(tmp_path: Path) -> ConversationStore:
    """Conversation store isolated to a temporary test directory."""
    return ConversationStore(base_dir=tmp_path / "conversations")


@pytest.fixture
def client(store: ConversationStore) -> TestClient:
    """API client backed by a temporary conversation store."""
    return TestClient(create_app(store))
