"""Demo: run a backtest against a SYNTHETIC EUR/USD series.

This is purely to verify wiring -- random-walk synthetic data is not a
real edge test. Use scripts/backtest.py with Dukascopy data for that.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone

from bot.backtest import BacktestConfig, run_backtest
from bot.config import Settings
from bot.marketdata import Bar


def make_bars(n: int = 30_000, start_price: float = 1.10, sigma: float = 0.00012, seed: int = 7) -> list[Bar]:
    rng = random.Random(seed)
    base = datetime(2025, 1, 6, 0, 0, tzinfo=timezone.utc)  # Monday 00:00 UTC
    bars: list[Bar] = []
    p = start_price
    for i in range(n):
        o = p
        h = o
        l_ = o
        for _ in range(10):
            p += rng.gauss(0, sigma)
            h = max(h, p)
            l_ = min(l_, p)
        c = p
        bars.append(Bar(
            time=base + timedelta(minutes=i),
            open=round(o, 5), high=round(h, 5), low=round(l_, 5),
            close=round(c, 5), volume=10,
        ))
    return bars


def main() -> int:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30_000
    bars = make_bars(n=n)
    print(f"synthetic bars: {len(bars)}  span: {bars[0].time}  ->  {bars[-1].time}")

    for label, kwargs in [
        ("MMLFX (impulse filter ON)", {}),
        ("MMLFX (impulse filter OFF)", {"use_impulse_filter": False}),
    ]:
        s = Settings(starting_balance=5.0)
        for k, v in kwargs.items():
            setattr(s.mmlfx, k, v)
        cfg = BacktestConfig(starting_balance=5.0)
        report = run_backtest(s, bars, cfg)
        print()
        print(label)
        print(report.render())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
