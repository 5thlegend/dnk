from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque

from ..marketdata import Bar


@dataclass
class _Pivot:
    price: float
    bar_index: int
    direction: int  # +1 = high pivot, -1 = low pivot


@dataclass
class _Leg:
    size: float
    direction: int  # +1 = up, -1 = down
    bar_start: int
    bar_end: int


@dataclass
class _State:
    zz_dir: int = 0
    zz_high: float | None = None
    zz_low: float | None = None
    zz_high_bar: int = 0
    zz_low_bar: int = 0
    pivots: Deque[_Pivot] = field(default_factory=lambda: deque(maxlen=12))
    legs: Deque[_Leg] = field(default_factory=lambda: deque(maxlen=20))
    last_triple_bull_bar: int = -10**9
    last_triple_bear_bar: int = -10**9
    last_processed_bar: int = -1


class ImpulseEngine:
    """Port of MMLFX's "Impulse Engine" subsystem.

    Detects ZigZag pivots (percentage-threshold reversals), builds a leg
    series, and flags 'triple impulse' patterns: three same-direction
    impulse legs separated by two smaller-than-impulse corrections.

    Used as an entry filter via `is_bull_fresh` / `is_bear_fresh`.

    State is incremental and idempotent across calls -- `process_history`
    only advances from the last watermark, so calling it on a growing
    list of bars is cheap and consistent."""

    def __init__(self, zz_pct: float = 0.03, correction_max_ratio: float = 0.8) -> None:
        self.zz_pct = zz_pct
        self.correction_max_ratio = correction_max_ratio
        self.state = _State()

    def process_history(self, bars: list[Bar]) -> None:
        for i in range(self.state.last_processed_bar + 1, len(bars)):
            self._process_bar(bars[i], i)
        self.state.last_processed_bar = len(bars) - 1

    def is_bull_fresh(self, current_bar: int, max_age: int) -> bool:
        return (current_bar - self.state.last_triple_bull_bar) <= max_age

    def is_bear_fresh(self, current_bar: int, max_age: int) -> bool:
        return (current_bar - self.state.last_triple_bear_bar) <= max_age

    def _process_bar(self, bar: Bar, bar_index: int) -> None:
        s = self.state

        if s.zz_high is None or s.zz_low is None:
            s.zz_high = bar.high
            s.zz_low = bar.low
            s.zz_high_bar = bar_index
            s.zz_low_bar = bar_index
            return

        threshold = bar.close * self.zz_pct / 100.0

        if bar.high > s.zz_high:
            s.zz_high = bar.high
            s.zz_high_bar = bar_index
        if bar.low < s.zz_low:
            s.zz_low = bar.low
            s.zz_low_bar = bar_index

        new_pivot = False

        if s.zz_dir >= 0:
            if (s.zz_high - bar.low) >= threshold and bar.low < (s.zz_high - threshold):
                s.pivots.append(_Pivot(price=s.zz_high, bar_index=s.zz_high_bar, direction=1))
                s.zz_dir = -1
                s.zz_low = bar.low
                s.zz_low_bar = bar_index
                new_pivot = True

        if s.zz_dir <= 0:
            if (bar.high - s.zz_low) >= threshold and bar.high > (s.zz_low + threshold):
                s.pivots.append(_Pivot(price=s.zz_low, bar_index=s.zz_low_bar, direction=-1))
                s.zz_dir = 1
                s.zz_high = bar.high
                s.zz_high_bar = bar_index
                new_pivot = True

        if new_pivot and len(s.pivots) >= 2:
            p1 = s.pivots[-2]
            p2 = s.pivots[-1]
            size = abs(p2.price - p1.price)
            direction = 1 if p2.price > p1.price else -1
            s.legs.append(_Leg(size=size, direction=direction, bar_start=p1.bar_index, bar_end=p2.bar_index))
            self._check_triple(bar_index)

    def _check_triple(self, bar_index: int) -> None:
        s = self.state
        if len(s.legs) < 5:
            return
        l5, l4, l3, l2, l1 = list(s.legs)[-5:]
        r = self.correction_max_ratio

        if (l5.direction == 1 and l4.direction == -1 and l3.direction == 1
                and l2.direction == -1 and l1.direction == 1
                and l4.size < l5.size * r and l2.size < l3.size * r):
            s.last_triple_bull_bar = bar_index
            return

        if (l5.direction == -1 and l4.direction == 1 and l3.direction == -1
                and l2.direction == 1 and l1.direction == -1
                and l4.size < l5.size * r and l2.size < l3.size * r):
            s.last_triple_bear_bar = bar_index
