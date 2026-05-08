from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

from ..connector import Tick


class SignalType(str, Enum):
    BUY = "buy"
    SELL = "sell"
    CLOSE = "close"
    HOLD = "hold"


@dataclass
class Signal:
    type: SignalType
    reason: str = ""


class Strategy(ABC):
    """The 'brain'. Phase 2 replaces NoopStrategy with the port of your
    Pine Script indicator. Receives every tick, decides BUY / SELL / CLOSE / HOLD."""

    @abstractmethod
    def on_tick(self, tick: Tick) -> Signal: ...
