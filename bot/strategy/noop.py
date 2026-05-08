from __future__ import annotations

from ..connector import Tick
from .base import Signal, SignalType, Strategy


class NoopStrategy(Strategy):
    """Placeholder strategy. Always holds. Replaced in Phase 2."""

    def on_tick(self, tick: Tick) -> Signal:
        return Signal(type=SignalType.HOLD, reason="noop placeholder")
