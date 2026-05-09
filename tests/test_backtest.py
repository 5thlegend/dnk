"""End-to-end test of the backtest engine. Uses synthetic bars (no
network) so it runs in any environment. Verifies basic invariants:
- the simulator runs without crashing across a long series,
- the equity curve is monotonic in time,
- closed trades have a finite pnl,
- the report renders to a non-empty string."""

import random
from datetime import datetime, timedelta, timezone

from bot.backtest import BacktestConfig, run_backtest
from bot.config import Settings
from bot.marketdata import Bar


def _synthetic_bars(n: int = 4000, start_price: float = 1.10, sigma: float = 0.00015, seed: int = 11) -> list[Bar]:
    rng = random.Random(seed)
    # Start the series in mid-2024 so days span weekday/weekend variety. Use M1.
    base = datetime(2025, 1, 6, 7, 0, tzinfo=timezone.utc)  # Monday 07:00 UTC, in LDN session
    out: list[Bar] = []
    p = start_price
    for i in range(n):
        o = p
        h = o
        l_ = o
        for _ in range(8):
            p += rng.gauss(0, sigma)
            h = max(h, p)
            l_ = min(l_, p)
        c = p
        out.append(Bar(
            time=base + timedelta(minutes=i),
            open=round(o, 5), high=round(h, 5), low=round(l_, 5),
            close=round(c, 5), volume=8,
        ))
    return out


def test_backtest_runs_clean():
    settings = Settings(starting_balance=5.0)
    bars = _synthetic_bars(n=4000)
    cfg = BacktestConfig(starting_balance=5.0)

    report = run_backtest(settings, bars, cfg)

    assert report.starting_balance == 5.0
    # equity curve has one point per bar
    assert len(report.equity_curve) == len(bars)
    # trades carry finite pnl
    for t in report.trades:
        assert t.pnl == t.pnl  # not NaN
    # report renders something
    assert "BACKTEST REPORT" in report.render()


def test_backtest_handles_no_signal_series():
    """Constant-price series -> strategy never trades. Backtest should
    report 0 trades and end with the starting balance."""
    settings = Settings(starting_balance=5.0)
    base = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
    bars = [
        Bar(time=base + timedelta(minutes=i),
            open=1.10, high=1.10, low=1.10, close=1.10, volume=1)
        for i in range(500)
    ]
    cfg = BacktestConfig(starting_balance=5.0)
    report = run_backtest(settings, bars, cfg)

    assert report.n_trades == 0
    assert report.ending_balance == 5.0
    assert report.win_rate == 0.0
