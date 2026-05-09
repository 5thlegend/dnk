from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass
class Tick:
    symbol: str
    bid: float
    ask: float
    time: datetime


@dataclass
class Order:
    symbol: str
    side: OrderSide
    volume: float
    sl: float | None = None
    tp: float | None = None
    comment: str = ""


@dataclass
class Position:
    ticket: int
    symbol: str
    side: OrderSide
    volume: float
    entry_price: float
    sl: float | None
    tp: float | None
    profit: float


class Connector(ABC):
    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def disconnect(self) -> None: ...

    @abstractmethod
    async def get_tick(self, symbol: str) -> Tick: ...

    @abstractmethod
    async def get_balance(self) -> float: ...

    @abstractmethod
    async def get_positions(self, symbol: str | None = None) -> list[Position]: ...

    @abstractmethod
    async def place_order(self, order: Order) -> Position: ...

    @abstractmethod
    async def close_position(self, ticket: int) -> None: ...

    async def get_history(self, symbol: str, timeframe: str, count: int) -> list:
        """Return closed historical bars (oldest first). Implementations
        return `bot.marketdata.Bar` objects. Default returns []; the engine
        will warm up from live ticks instead."""
        return []
