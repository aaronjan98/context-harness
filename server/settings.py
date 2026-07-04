"""Persistent settings for Context Forge (stored outside the repo)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

SETTINGS_PATH = Path.home() / ".config" / "context-forge" / "settings.json"


@dataclass
class CFSettings:
    auto_run: bool = False
    pushbullet_token: str | None = None


def load_settings() -> CFSettings:
    if not SETTINGS_PATH.exists():
        return CFSettings()
    try:
        data = json.loads(SETTINGS_PATH.read_text())
        return CFSettings(
            auto_run=bool(data.get("auto_run", False)),
            pushbullet_token=data.get("pushbullet_token") or None,
        )
    except Exception:
        return CFSettings()


def save_settings(settings: CFSettings) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(asdict(settings), indent=2))
