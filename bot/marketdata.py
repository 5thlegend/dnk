from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .connector.base import Tick


TIMEFRAME_SECONDS: dict[str, int] = {
    "M1": 60,
    "M5": 5 * 60,
    "M15": 15 * 60,
    "M30": 30 * 60,
    "H1": 60 * 60,
    "H4": 4 * 60 * 60,
    "D1": 24 * 60 * 60,
}


@dataclass
class Bar:
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int = 0


class BarAggregator:
    """Aggregates ticks into OHLC bars at a fixed timeframe.

    Pricing uses the tick mid (bid+ask)/2. The bar `time` is the bar OPEN
    time (epoch floored to the timeframe), in UTC.

    Returns the closed bar from `on_tick` whenever a tick crosses a
    timeframe boundary, or None otherwise. Closed bars accumulate in
    `history` (a bounded deque)."""

    def __init__(self, timeframe: str, history_size: int = 500) -> None:
        if timeframe not in TIMEFRAME_SECONDS:
            raise ValueError(f"Unknown timeframe: {timeframe!r}")
        self.timeframe = timeframe
        self._tf_seconds = TIMEFRAME_SECONDS[timeframe]
        self.history: deque[Bar] = deque(maxlen=history_size)
        self._current: Bar | None = None

    def _bar_open_time(self, t: datetime) -> datetime:
        epoch = int(t.timestamp())
        floored = epoch - (epoch % self._tf_seconds)
        return datetime.fromtimestamp(floored, tz=timezone.utc)

    def seed(self, bars: list[Bar]) -> None:
        for b in bars:
            self.history.append(b)

    def on_tick(self, tick: "Tick") -> Bar | None:
        price = (tick.bid + tick.ask) / 2.0
        bar_time = self._bar_open_time(tick.time)

        if self._current is None:
            self._current = Bar(time=bar_time, open=price, high=price, low=price, close=price, volume=1)
            return None

        if bar_time > self._current.time:
            closed = self._current
            self.history.append(closed)
            self._current = Bar(time=bar_time, open=price, high=price, low=price, close=price, volume=1)
            return closed

        self._current.high = max(self._current.high, price)
        self._current.low = min(self._current.low, price)
        self._current.close = price
        self._current.volume += 1
        return None

    def history_with_current(self) -> list[Bar]:
        bars = list(self.history)
        if self._current is not None:
            bars.append(self._current)
        return bars
