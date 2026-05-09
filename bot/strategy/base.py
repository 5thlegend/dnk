from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from ..connector import Tick
from ..marketdata import Bar


class SignalType(str, Enum):
    BUY = "buy"
    SELL = "sell"
    CLOSE = "close"
    HOLD = "hold"


@dataclass
class Signal:
    type: SignalType
    reason: str = ""
    sl: float | None = None
    tp: float | None = None
    volume: float | None = None


class Strategy:
    """Base strategy. Subclasses override `on_tick` and/or `on_bar_close`.

    `on_tick`: called for every tick. Default returns HOLD. Use this for
    very short-lived state or trailing-stop logic.

    `on_bar_close`: called once per closed bar with the full bar history
    (oldest first, includes the just-closed bar at the end). Default returns
    HOLD. This is where most strategies live.

    The engine calls both. If both return non-HOLD on the same tick the
    bar-close signal wins (it represents a more deliberate decision)."""

    def on_tick(self, tick: Tick) -> Signal:
        return Signal(type=SignalType.HOLD)

    def on_bar_close(self, bars: list[Bar]) -> Signal:
        return Signal(type=SignalType.HOLD)

    def update_equity(self, equity: float) -> None:
        pass

    def update_position_side(self, side: int) -> None:
        """side: +1 long, -1 short, 0 flat."""
        pass
