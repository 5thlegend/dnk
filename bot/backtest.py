"""Bar-replay backtest engine.

Replays a fixed list of OHLC bars through a Strategy via on_bar_close,
simulating broker fills with explicit spread, slippage, and commission.
Tracks an equity curve and produces summary statistics.

Modeling choices (named so you can argue with them):
- Fills happen at the bar's CLOSE plus spread (buy at close+spread/2,
  sell at close-spread/2). This matches what your Pine source assumed
  (process_orders_on_close=false but signals computed at close).
- SL/TP intra-bar: if both the SL and TP price levels lie within the
  next bar's [low, high] range, we PESSIMISTICALLY assume SL hit first.
  That avoids overstating performance.
- Commission is per-order, charged at fill, in account currency.
- Slippage is added to the entry price in the trade's direction (worse
  fill for the trader). Same for stop fills.
- Equity = balance + open-position MtM at the close of each bar.
- No rollover/swap modeling. EUR/USD swap is small at these sizes; if
  you want it, add a flat per-day cost in `BacktestConfig`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable

from .config import Settings
from .marketdata import Bar
from .strategy import Strategy, build_strategy
from .strategy.base import Signal, SignalType


@dataclass
class BacktestConfig:
    starting_balance: float = 5.0
    spread_pips: float = 1.0
    slippage_pips: float = 0.2
    commission_per_lot: float = 7.0
    pip_size: float = 0.0001
    pip_dollar_value_per_lot: float = 10.0  # EURUSD; JPY pairs differ


@dataclass
class _OpenTrade:
    side: int  # +1 long, -1 short
    entry_price: float
    sl: float | None
    tp: float | None
    volume: float
    entry_time: datetime
    reason: str
    commission_paid: float


@dataclass
class ClosedTrade:
    side: int
    entry_time: datetime
    entry_price: float
    exit_time: datetime
    exit_price: float
    volume: float
    pnl: float
    reason_open: str
    reason_close: str


@dataclass
class BacktestReport:
    starting_balance: float
    ending_balance: float
    n_trades: int
    n_wins: int
    n_losses: int
    win_rate: float
    profit_factor: float
    max_drawdown_pct: float
    sharpe: float | None
    equity_curve: list[tuple[datetime, float]]
    trades: list[ClosedTrade]
    micro_count: int = 0
    breakout_count: int = 0

    def render(self) -> str:
        lines = [
            "=" * 60,
            "BACKTEST REPORT",
            "=" * 60,
            f"Starting balance:   ${self.starting_balance:>12.2f}",
            f"Ending balance:     ${self.ending_balance:>12.2f}",
            f"Net P&L:            ${self.ending_balance - self.starting_balance:>+12.2f}  "
            f"({(self.ending_balance / self.starting_balance - 1) * 100:+.1f}%)",
            f"Total trades:       {self.n_trades}",
            f"  MICRO:            {self.micro_count}",
            f"  BREAKOUT:         {self.breakout_count}",
            f"Win rate:           {self.win_rate * 100:.1f}%  ({self.n_wins}W / {self.n_losses}L)",
            f"Profit factor:      {self.profit_factor:.2f}" if math.isfinite(self.profit_factor) else "Profit factor:      inf (no losses)",
            f"Max drawdown:       {self.max_drawdown_pct:.1f}%",
            f"Sharpe (per trade): {self.sharpe:.2f}" if self.sharpe is not None else "Sharpe (per trade): n/a",
            "=" * 60,
        ]
        return "\n".join(lines)


def _close_pnl(trade: _OpenTrade, exit_price: float, cfg: BacktestConfig) -> float:
    direction = trade.side
    raw = (exit_price - trade.entry_price) * direction * trade.volume * (1.0 / cfg.pip_size) * cfg.pip_dollar_value_per_lot
    return raw - trade.commission_paid


def run_backtest(
    settings: Settings,
    bars: list[Bar],
    cfg: BacktestConfig | None = None,
    strategy: Strategy | None = None,
) -> BacktestReport:
    """Replay `bars` through the configured strategy. Returns a report."""
    if cfg is None:
        cfg = BacktestConfig(starting_balance=settings.starting_balance)
    if strategy is None:
        strategy = build_strategy(settings)

    half_spread = cfg.spread_pips * cfg.pip_size / 2.0
    slip = cfg.slippage_pips * cfg.pip_size

    balance = cfg.starting_balance
    open_trade: _OpenTrade | None = None
    closed: list[ClosedTrade] = []
    equity_curve: list[tuple[datetime, float]] = []
    micro_count = 0
    breakout_count = 0

    for i in range(len(bars)):
        bar = bars[i]
        history = bars[: i + 1]

        # 1) Resolve any open trade against THIS bar's OHLC range first
        if open_trade is not None:
            # If both SL and TP are inside the bar range, pessimistically assume SL hit.
            sl_hit = open_trade.sl is not None and (
                (open_trade.side == 1 and bar.low <= open_trade.sl)
                or (open_trade.side == -1 and bar.high >= open_trade.sl)
            )
            tp_hit = open_trade.tp is not None and (
                (open_trade.side == 1 and bar.high >= open_trade.tp)
                or (open_trade.side == -1 and bar.low <= open_trade.tp)
            )
            exit_price: float | None = None
            reason_close: str = ""
            if sl_hit and tp_hit:
                exit_price = open_trade.sl
                reason_close = "SL (ambiguous bar; conservative)"
            elif sl_hit:
                exit_price = open_trade.sl
                reason_close = "SL"
            elif tp_hit:
                exit_price = open_trade.tp
                reason_close = "TP"

            if exit_price is not None:
                # apply slippage on stop-out (worse fill for trader)
                if reason_close.startswith("SL"):
                    exit_price = exit_price - slip if open_trade.side == 1 else exit_price + slip
                pnl = _close_pnl(open_trade, exit_price, cfg)
                balance += pnl
                closed.append(ClosedTrade(
                    side=open_trade.side,
                    entry_time=open_trade.entry_time,
                    entry_price=open_trade.entry_price,
                    exit_time=bar.time,
                    exit_price=exit_price,
                    volume=open_trade.volume,
                    pnl=pnl,
                    reason_open=open_trade.reason,
                    reason_close=reason_close,
                ))
                open_trade = None

        # 2) Update strategy ambient state and ask for a signal at this bar's close
        strategy.update_equity(balance)
        strategy.update_position_side(open_trade.side if open_trade else 0)
        signal = strategy.on_bar_close(history)

        if signal.type is SignalType.CLOSE and open_trade is not None:
            exit_price = bar.close - half_spread if open_trade.side == 1 else bar.close + half_spread
            pnl = _close_pnl(open_trade, exit_price, cfg)
            balance += pnl
            closed.append(ClosedTrade(
                side=open_trade.side,
                entry_time=open_trade.entry_time,
                entry_price=open_trade.entry_price,
                exit_time=bar.time,
                exit_price=exit_price,
                volume=open_trade.volume,
                pnl=pnl,
                reason_open=open_trade.reason,
                reason_close=signal.reason or "strategy close",
            ))
            open_trade = None

        elif signal.type in (SignalType.BUY, SignalType.SELL):
            target_side = 1 if signal.type is SignalType.BUY else -1

            # Flip if opposite-side trade is open
            if open_trade is not None and open_trade.side != target_side:
                exit_price = bar.close - half_spread if open_trade.side == 1 else bar.close + half_spread
                pnl = _close_pnl(open_trade, exit_price, cfg)
                balance += pnl
                closed.append(ClosedTrade(
                    side=open_trade.side,
                    entry_time=open_trade.entry_time,
                    entry_price=open_trade.entry_price,
                    exit_time=bar.time,
                    exit_price=exit_price,
                    volume=open_trade.volume,
                    pnl=pnl,
                    reason_open=open_trade.reason,
                    reason_close=f"flip ({signal.reason})",
                ))
                open_trade = None

            if open_trade is None:
                vol = signal.volume if signal.volume is not None else 0.01
                # Buy at ask = close + half_spread + slip; Sell at bid = close - half_spread - slip
                if target_side == 1:
                    fill = bar.close + half_spread + slip
                else:
                    fill = bar.close - half_spread - slip
                commission = vol * cfg.commission_per_lot
                balance -= commission
                open_trade = _OpenTrade(
                    side=target_side,
                    entry_price=fill,
                    sl=signal.sl,
                    tp=signal.tp,
                    volume=vol,
                    entry_time=bar.time,
                    reason=signal.reason or "",
                    commission_paid=commission,
                )
                if "MICRO" in signal.reason:
                    micro_count += 1
                elif "BREAKOUT" in signal.reason:
                    breakout_count += 1

        # 3) Mark-to-market equity at this bar
        equity = balance
        if open_trade is not None:
            mtm = (bar.close - open_trade.entry_price) * open_trade.side * open_trade.volume * (1.0 / cfg.pip_size) * cfg.pip_dollar_value_per_lot
            equity += mtm
        equity_curve.append((bar.time, equity))

    # Close any dangling position at last bar's close
    if open_trade is not None and bars:
        last = bars[-1]
        exit_price = last.close - half_spread if open_trade.side == 1 else last.close + half_spread
        pnl = _close_pnl(open_trade, exit_price, cfg)
        balance += pnl
        closed.append(ClosedTrade(
            side=open_trade.side,
            entry_time=open_trade.entry_time,
            entry_price=open_trade.entry_price,
            exit_time=last.time,
            exit_price=exit_price,
            volume=open_trade.volume,
            pnl=pnl,
            reason_open=open_trade.reason,
            reason_close="EOD (end of data)",
        ))

    # Stats
    n = len(closed)
    wins = sum(1 for t in closed if t.pnl > 0)
    losses = sum(1 for t in closed if t.pnl < 0)
    gross_profit = sum(t.pnl for t in closed if t.pnl > 0)
    gross_loss = -sum(t.pnl for t in closed if t.pnl < 0)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf")
    win_rate = (wins / n) if n else 0.0

    # Drawdown on equity curve
    peak = -math.inf
    max_dd = 0.0
    for _, eq in equity_curve:
        peak = max(peak, eq)
        if peak > 0:
            dd = (peak - eq) / peak * 100.0
            max_dd = max(max_dd, dd)

    # Per-trade Sharpe (rough; not annualized)
    if n >= 2:
        rs = [t.pnl / cfg.starting_balance for t in closed]
        mean = sum(rs) / n
        var = sum((r - mean) ** 2 for r in rs) / (n - 1)
        sharpe = (mean / math.sqrt(var)) if var > 0 else None
    else:
        sharpe = None

    return BacktestReport(
        starting_balance=cfg.starting_balance,
        ending_balance=balance,
        n_trades=n,
        n_wins=wins,
        n_losses=losses,
        win_rate=win_rate,
        profit_factor=profit_factor,
        max_drawdown_pct=max_dd,
        sharpe=sharpe,
        equity_curve=equity_curve,
        trades=closed,
        micro_count=micro_count,
        breakout_count=breakout_count,
    )
