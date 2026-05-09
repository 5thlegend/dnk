"""CLI to run a backtest of the configured strategy against historical
EUR/USD (or other instrument) data from Dukascopy.

Usage:
    python -m scripts.backtest --instrument EURUSD --from 2025-01-01 --to 2025-04-01 --timeframe M1

Caches Dukascopy bi5 files under .cache/dukascopy/. First run is slow
(downloads ~1MB per trading hour); subsequent runs read from disk.

Note: the Dukascopy CDN is blocked in some sandboxes (you'll see
"Host not in allowlist" or 403). Run this from your VPS or local
machine, not from a restricted shell.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from bot.backtest import BacktestConfig, run_backtest
from bot.config import Settings
from bot.data import DukascopyClient


def _parse_date(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


async def _amain(args: argparse.Namespace) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    log = logging.getLogger("backtest")

    start = _parse_date(args.start)
    end = _parse_date(args.end)
    if end <= start:
        log.error("--to must be after --from")
        return 2

    settings = Settings(
        symbol=args.instrument,
        timeframe=args.timeframe,
        starting_balance=args.starting_balance,
    )
    if args.no_impulse_filter:
        settings.mmlfx.use_impulse_filter = False
    if args.manual_phase:
        settings.mmlfx.auto_phase = False
        settings.mmlfx.manual_phase = args.manual_phase.upper()

    log.info("downloading %s bars from %s to %s (cache=%s)", args.timeframe, start.date(), end.date(), args.cache_dir)
    client = DukascopyClient(cache_dir=args.cache_dir, max_concurrency=args.concurrency)
    bars = await client.fetch_range_bars(args.instrument, start, end, args.timeframe)
    log.info("got %d bars", len(bars))
    if len(bars) < 250:
        log.error("not enough bars to clear MMLFX warmup (need >=250, got %d)", len(bars))
        return 3

    cfg = BacktestConfig(
        starting_balance=args.starting_balance,
        spread_pips=args.spread_pips,
        slippage_pips=args.slippage_pips,
        commission_per_lot=args.commission,
    )

    log.info("running backtest: strategy=%s impulse_filter=%s phase=%s",
             settings.strategy.value, settings.mmlfx.use_impulse_filter,
             ("auto" if settings.mmlfx.auto_phase else settings.mmlfx.manual_phase))
    report = run_backtest(settings, bars, cfg)

    print(report.render())

    if args.trades_out:
        with open(args.trades_out, "w") as f:
            for t in report.trades:
                f.write(json.dumps({
                    "side": "BUY" if t.side == 1 else "SELL",
                    "entry_time": t.entry_time.isoformat(),
                    "entry_price": t.entry_price,
                    "exit_time": t.exit_time.isoformat(),
                    "exit_price": t.exit_price,
                    "volume": t.volume,
                    "pnl": t.pnl,
                    "reason_open": t.reason_open,
                    "reason_close": t.reason_close,
                }) + "\n")
        log.info("wrote %d trades to %s", len(report.trades), args.trades_out)

    if args.equity_out:
        with open(args.equity_out, "w") as f:
            for t, eq in report.equity_curve:
                f.write(f"{t.isoformat()},{eq:.4f}\n")
        log.info("wrote equity curve to %s", args.equity_out)

    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Backtest the configured strategy on Dukascopy data.")
    p.add_argument("--instrument", default="EURUSD")
    p.add_argument("--from", dest="start", required=True, help="Start date (YYYY-MM-DD), UTC inclusive.")
    p.add_argument("--to", dest="end", required=True, help="End date (YYYY-MM-DD), UTC exclusive.")
    p.add_argument("--timeframe", default="M1")
    p.add_argument("--starting-balance", type=float, default=5.0)
    p.add_argument("--spread-pips", type=float, default=1.0)
    p.add_argument("--slippage-pips", type=float, default=0.2)
    p.add_argument("--commission", type=float, default=7.0,
                   help="Commission per lot per side, in account currency.")
    p.add_argument("--no-impulse-filter", action="store_true",
                   help="Disable the triple-impulse entry filter.")
    p.add_argument("--manual-phase", choices=["MICRO", "BREAKOUT", "micro", "breakout"],
                   help="Force a single phase instead of auto-switching at $30.")
    p.add_argument("--cache-dir", default=str(Path(".cache") / "dukascopy"))
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--trades-out", help="If set, write per-trade JSONL to this path.")
    p.add_argument("--equity-out", help="If set, write equity curve CSV to this path.")
    args = p.parse_args()

    return asyncio.run(_amain(args))


if __name__ == "__main__":
    sys.exit(main())
