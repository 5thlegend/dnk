from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from .config import Settings
from .connector import Connector, Order, OrderSide, Position, build_connector
from .marketdata import BarAggregator
from .risk import daily_loss_breached, position_volume
from .state import EngineState, EngineStatus, TradeRecord
from .strategy import Signal, SignalType, Strategy, build_strategy

log = logging.getLogger(__name__)


class Engine:
    """Async trading engine.

    Lifecycle:
        engine.update_settings(...)   # configure
        await engine.start()          # spawns background task
        await engine.stop()           # cancels task, closes positions

    Per loop iteration:
      1. Pull a tick from the connector.
      2. Update strategy ambient state (equity, position side).
      3. Feed the tick into the bar aggregator. If a bar closed, call
         strategy.on_bar_close(history). Otherwise call strategy.on_tick.
      4. Act on any non-HOLD signal (place / close orders).
      5. Honor risk rules (daily loss limit halts the engine).

    Strategies that emit `signal.sl`, `signal.tp`, `signal.volume` have
    those values passed through to the broker. Otherwise risk-based
    sizing kicks in."""

    def __init__(self) -> None:
        self.settings = Settings()
        self.state = EngineState()
        self._connector: Connector | None = None
        self._strategy: Strategy = build_strategy(self.settings)
        self._aggregator: BarAggregator | None = None
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    def update_settings(self, settings: Settings) -> None:
        if self.state.status not in {EngineStatus.STOPPED, EngineStatus.ERROR}:
            raise RuntimeError("Stop the engine before changing settings.")
        self.settings = settings
        self._strategy = build_strategy(settings)

    def set_strategy(self, strategy: Strategy) -> None:
        self._strategy = strategy

    async def start(self) -> None:
        async with self._lock:
            if self.state.status in {EngineStatus.RUNNING, EngineStatus.STARTING}:
                return
            self.state = EngineState(status=EngineStatus.STARTING)
            self._connector = build_connector(self.settings)
            await self._connector.connect()
            self.state.balance = await self._connector.get_balance()

            self._aggregator = BarAggregator(self.settings.timeframe, history_size=500)
            seed = await self._connector.get_history(
                self.settings.symbol, self.settings.timeframe, count=300
            )
            if seed:
                self._aggregator.seed(seed)

            self._strategy = build_strategy(self.settings)
            self._strategy.update_equity(self.state.balance)

            self.state.status = EngineStatus.RUNNING
            self._task = asyncio.create_task(self._run(), name="engine-loop")

    async def stop(self) -> None:
        async with self._lock:
            if self.state.status == EngineStatus.STOPPED:
                return
            self.state.status = EngineStatus.STOPPING
            task = self._task
            self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if self._connector is not None:
            for pos in await self._connector.get_positions(self.settings.symbol):
                await self._connector.close_position(pos.ticket)
            await self._connector.disconnect()
            self._connector = None
        self._aggregator = None
        self.state.status = EngineStatus.STOPPED

    @staticmethod
    def _position_side(positions: list[Position]) -> int:
        for p in positions:
            return 1 if p.side is OrderSide.BUY else -1
        return 0

    async def _run(self) -> None:
        assert self._connector is not None
        assert self._aggregator is not None
        starting_equity = self.state.balance
        try:
            while True:
                tick = await self._connector.get_tick(self.settings.symbol)
                self.state.last_tick_time = tick.time
                self.state.last_bid = tick.bid
                self.state.last_ask = tick.ask
                self.state.tick_count += 1

                positions = await self._connector.get_positions(self.settings.symbol)
                self.state.open_positions = len(positions)
                self.state.balance = await self._connector.get_balance()

                if daily_loss_breached(self.settings, starting_equity, self.state.balance):
                    self.state.last_error = "Daily loss limit hit. Engine halted."
                    log.warning(self.state.last_error)
                    break

                self._strategy.update_equity(self.state.balance)
                self._strategy.update_position_side(self._position_side(positions))

                tick_signal = self._strategy.on_tick(tick)
                bar_signal: Signal | None = None
                closed_bar = self._aggregator.on_tick(tick)
                if closed_bar is not None:
                    bar_signal = self._strategy.on_bar_close(self._aggregator.history_with_current())

                signal = bar_signal if (bar_signal and bar_signal.type is not SignalType.HOLD) else tick_signal
                if signal.type is not SignalType.HOLD:
                    await self._handle_signal(signal, positions)

                await asyncio.sleep(self.settings.poll_interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("Engine loop crashed")
            self.state.status = EngineStatus.ERROR
            self.state.last_error = repr(e)

    async def _handle_signal(self, signal: Signal, positions: list[Position]) -> None:
        assert self._connector is not None

        if signal.type is SignalType.CLOSE:
            for pos in positions:
                await self._connector.close_position(pos.ticket)
                self.state.trades.append(TradeRecord(
                    time=datetime.now(timezone.utc),
                    symbol=pos.symbol, side=pos.side.value, volume=pos.volume,
                    entry_price=pos.entry_price, exit_price=None, profit=None,
                    reason=signal.reason or "close signal",
                ))
            return

        target_side = OrderSide.BUY if signal.type is SignalType.BUY else OrderSide.SELL

        for pos in positions:
            if pos.side is not target_side:
                await self._connector.close_position(pos.ticket)
                self.state.trades.append(TradeRecord(
                    time=datetime.now(timezone.utc),
                    symbol=pos.symbol, side=pos.side.value, volume=pos.volume,
                    entry_price=pos.entry_price, exit_price=None, profit=None,
                    reason=f"flip ({signal.reason or signal.type.value})",
                ))
        positions_after = await self._connector.get_positions(self.settings.symbol)
        if len(positions_after) >= self.settings.max_open_positions:
            return

        volume = signal.volume if signal.volume is not None else position_volume(
            self.settings, self.state.balance, stop_distance_pips=20.0,
        )
        order = Order(
            symbol=self.settings.symbol, side=target_side, volume=volume,
            sl=signal.sl, tp=signal.tp, comment=signal.reason[:30],
        )
        position = await self._connector.place_order(order)
        self.state.trades.append(TradeRecord(
            time=datetime.now(timezone.utc),
            symbol=position.symbol, side=position.side.value, volume=position.volume,
            entry_price=position.entry_price, exit_price=None, profit=None,
            reason=signal.reason or f"{signal.type.value} signal",
        ))


engine = Engine()
