from __future__ import annotations

from ..config import Mode, Settings
from .base import Connector
from .mock import MockConnector


def build_connector(settings: Settings) -> Connector:
    if settings.mode is Mode.MOCK:
        return MockConnector(starting_balance=settings.starting_balance)
    raise NotImplementedError(
        f"Connector for mode={settings.mode!r} is not implemented yet. "
        "Phase 4 adds the real MetaTrader5 connector."
    )
