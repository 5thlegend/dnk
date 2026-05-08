from __future__ import annotations

import itertools
import random
from datetime import datetime, timezone

from .base import Connector, Order, OrderSide, Position, Tick


class MockConnector(Connector):
    """In-memory simulator. Generates a random-walk price so the engine has
    something to react to during local development. No real money, no real
    network. The instant we have your Pine Script ported, this is what we'll
    point the strategy at first."""

    def __init__(self, starting_balance: float, mid_price: float = 1.0850) -> None:
        self._balance = starting_balance
        self._equity = starting_balance
        self._mid = mid_price
        self._spread = 0.00010
        self._positions: dict[int, Position] = {}
        self._ticket_seq = itertools.count(1)
        self._connected = False

    async def connect(self) -> None:
        self._connected = True

    async def disconnect(self) -> None:
        self._connected = False

    async def get_tick(self, symbol: str) -> Tick:
        self._mid += random.gauss(0, 0.00015)
        bid = round(self._mid - self._spread / 2, 5)
        ask = round(self._mid + self._spread / 2, 5)
        return Tick(symbol=symbol, bid=bid, ask=ask, time=datetime.now(timezone.utc))

    async def get_balance(self) -> float:
        return self._balance

    async def get_positions(self, symbol: str | None = None) -> list[Position]:
        positions = list(self._positions.values())
        if symbol is not None:
            positions = [p for p in positions if p.symbol == symbol]
        return positions

    async def place_order(self, order: Order) -> Position:
        tick = await self.get_tick(order.symbol)
        entry = tick.ask if order.side is OrderSide.BUY else tick.bid
        ticket = next(self._ticket_seq)
        position = Position(
            ticket=ticket,
            symbol=order.symbol,
            side=order.side,
            volume=order.volume,
            entry_price=entry,
            sl=order.sl,
            tp=order.tp,
            profit=0.0,
        )
        self._positions[ticket] = position
        return position

    async def close_position(self, ticket: int) -> None:
        position = self._positions.pop(ticket, None)
        if position is None:
            return
        tick = await self.get_tick(position.symbol)
        exit_price = tick.bid if position.side is OrderSide.BUY else tick.ask
        direction = 1 if position.side is OrderSide.BUY else -1
        pnl = (exit_price - position.entry_price) * direction * position.volume * 100_000
        self._balance += pnl
        self._equity = self._balance
