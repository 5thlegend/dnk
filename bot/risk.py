from __future__ import annotations

from .config import Settings


def position_volume(settings: Settings, balance: float, stop_distance_pips: float) -> float:
    """Risk-based position sizing.

    Risk a fixed % of balance per trade. Volume is computed from the stop-loss
    distance so that hitting the stop costs exactly that %, not more.

    EURUSD pip value at 1.00 lot ≈ $10. Smallest tradable lot on most MT5
    brokers is 0.01 (micro lot). We floor to 0.01 and never exceed 1% of balance
    of notional exposure when stop_distance is unknown.
    """
    if stop_distance_pips <= 0:
        return 0.01
    risk_amount = balance * (settings.risk_per_trade_pct / 100.0)
    pip_value_per_lot = 10.0
    lots = risk_amount / (stop_distance_pips * pip_value_per_lot)
    lots = max(0.01, round(lots, 2))
    return lots


def daily_loss_breached(settings: Settings, starting_equity: float, current_equity: float) -> bool:
    if starting_equity <= 0:
        return False
    drawdown_pct = (starting_equity - current_equity) / starting_equity * 100.0
    return drawdown_pct >= settings.max_daily_loss_pct
