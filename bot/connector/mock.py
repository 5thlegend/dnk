from __future__ import annotations

import itertools
import random
from datetime import datetime, timedelta, timezone

from ..marketdata import Bar, TIMEFRAME_SECONDS
from .base import Connector, Order, OrderSide, Position, Tick


class MockConnector(Connector):
    """In-memory simulator. Generates a random-walk price so the engine has
    something to react to during local development.

    Intra-tick housekeeping: every `get_tick` call also enforces the SL/TP
    of any open positions (a real broker handles this server-side; the mock
    has to fake it). Realised P&L lands in `_balance`."""

    def __init__(self, starting_balance: float, mid_price: float = 1.0850) -> None:
        self._balance = starting_balance
        self._mid = mid_price
        self._spread = 0.00010
        self._positions: dict[int, Position] = {}
        self._ticket_seq = itertools.count(1)
        self._connected = False

    async def connect(self) -> None:
        self._connected = True

    async def disconnect(self) -> None:
        self._connected = False

    def _step_mid(self, sigma: float = 0.00015) -> None:
        self._mid += random.gauss(0, sigma)

    def _quote(self) -> tuple[float, float]:
        bid = round(self._mid - self._spread / 2, 5)
        ask = round(self._mid + self._spread / 2, 5)
        return bid, ask

    async def get_tick(self, symbol: str) -> Tick:
        self._step_mid()
        bid, ask = self._quote()
        tick = Tick(symbol=symbol, bid=bid, ask=ask, time=datetime.now(timezone.utc))

        # Server-side SL/TP emulation
        for ticket, pos in list(self._positions.items()):
            if pos.symbol != symbol:
                continue
            if pos.side is OrderSide.BUY:
                if pos.sl is not None and bid <= pos.sl:
                    await self.close_position(ticket)
                elif pos.tp is not None and bid >= pos.tp:
                    await self.close_position(ticket)
            else:
                if pos.sl is not None and ask >= pos.sl:
                    await self.close_position(ticket)
                elif pos.tp is not None and ask <= pos.tp:
                    await self.close_position(ticket)

        return tick

    async def get_balance(self) -> float:
        return self._balance

    async def get_positions(self, symbol: str | None = None) -> list[Position]:
        positions = list(self._positions.values())
        if symbol is not None:
            positions = [p for p in positions if p.symbol == symbol]
        return positions

    async def place_order(self, order: Order) -> Position:
        bid, ask = self._quote()
        entry = ask if order.side is OrderSide.BUY else bid
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
        bid, ask = self._quote()
        exit_price = bid if position.side is OrderSide.BUY else ask
        direction = 1 if position.side is OrderSide.BUY else -1
        pnl = (exit_price - position.entry_price) * direction * position.volume * 100_000
        self._balance += pnl

    async def get_history(self, symbol: str, timeframe: str, count: int) -> list[Bar]:
        """Synthesize a plausible-looking random-walk history ending now.

        Just enough realism to warm up indicators (EMA-200) and unblock the
        strategy in mock mode. Not a substitute for real historical data --
        Phase 3 wires up real EUR/USD ticks from a CSV / API."""
        tf_seconds = TIMEFRAME_SECONDS[timeframe]
        now = datetime.now(timezone.utc)
        epoch = int(now.timestamp())
        last_open_epoch = epoch - (epoch % tf_seconds) - tf_seconds
        bars: list[Bar] = []
        rng = random.Random(42)
        price = self._mid
        for i in range(count):
            t = datetime.fromtimestamp(last_open_epoch - (count - 1 - i) * tf_seconds, tz=timezone.utc)
            o = price
            steps = max(4, tf_seconds // 15)
            highs = [o]
            lows = [o]
            for _ in range(steps):
                price += rng.gauss(0, 0.00015)
                highs.append(price)
                lows.append(price)
            c = price
            bars.append(Bar(
                time=t,
                open=round(o, 5),
                high=round(max(highs), 5),
                low=round(min(lows), 5),
                close=round(c, 5),
                volume=steps,
            ))
        self._mid = price
        return bars
