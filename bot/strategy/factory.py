from __future__ import annotations

from ..config import Settings, StrategyName
from .base import Strategy
from .mmlfx import MMLFXStrategy
from .noop import NoopStrategy


def build_strategy(settings: Settings) -> Strategy:
    if settings.strategy is StrategyName.MMLFX:
        return MMLFXStrategy(settings)
    if settings.strategy is StrategyName.NOOP:
        return NoopStrategy()
    raise ValueError(f"Unknown strategy: {settings.strategy!r}")
