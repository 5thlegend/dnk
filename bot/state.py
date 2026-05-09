from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class EngineStatus(str, Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class TradeRecord:
    time: datetime
    symbol: str
    side: str
    volume: float
    entry_price: float
    exit_price: float | None
    profit: float | None
    reason: str


@dataclass
class EngineState:
    status: EngineStatus = EngineStatus.STOPPED
    last_error: str | None = None
    last_tick_time: datetime | None = None
    last_bid: float | None = None
    last_ask: float | None = None
    balance: float = 0.0
    open_positions: int = 0
    tick_count: int = 0
    trades: deque[TradeRecord] = field(default_factory=lambda: deque(maxlen=200))

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "last_error": self.last_error,
            "last_tick_time": self.last_tick_time.isoformat() if self.last_tick_time else None,
            "last_bid": self.last_bid,
            "last_ask": self.last_ask,
            "balance": self.balance,
            "open_positions": self.open_positions,
            "tick_count": self.tick_count,
            "trades": [
                {
                    "time": t.time.isoformat(),
                    "symbol": t.symbol,
                    "side": t.side,
                    "volume": t.volume,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "profit": t.profit,
                    "reason": t.reason,
                }
                for t in list(self.trades)[-50:]
            ],
        }
