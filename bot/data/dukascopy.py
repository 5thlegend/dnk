"""Dukascopy historical tick downloader.

Dukascopy publishes free tick history at:
    https://datafeed.dukascopy.com/datafeed/{INSTRUMENT}/{YYYY}/{MM-1:02d}/{DD:02d}/{HH:02d}h_ticks.bi5

NOTE the month is **zero-indexed** in the URL path (January = 00). Each
file is one hour of UTC ticks for one instrument, LZMA1-compressed in
the legacy ALONE format (not standard xz/.xz). Empty files exist for
hours with no trading (weekends, holidays); a successful HTTP 200 with
zero or near-zero bytes is normal and means "no ticks this hour".

Each tick record (after decompression) is 20 bytes big-endian:
    uint32  time_offset_ms (from the hour's UTC start)
    uint32  ask_raw        (multiply by point value -> price)
    uint32  bid_raw
    float32 ask_volume
    float32 bid_volume

Point values are instrument-specific. Most major pairs use 100_000
(prices like 1.08543). JPY pairs use 1_000 (prices like 152.345).
"""

from __future__ import annotations

import asyncio
import logging
import lzma
import struct
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

import httpx

from ..marketdata import Bar, TIMEFRAME_SECONDS

log = logging.getLogger(__name__)


POINT_VALUES: dict[str, int] = {
    "EURUSD": 100_000,
    "GBPUSD": 100_000,
    "AUDUSD": 100_000,
    "NZDUSD": 100_000,
    "USDCHF": 100_000,
    "USDCAD": 100_000,
    "EURGBP": 100_000,
    "EURJPY": 1_000,
    "USDJPY": 1_000,
    "GBPJPY": 1_000,
    "AUDJPY": 1_000,
    "XAUUSD": 1_000,
}


@dataclass(slots=True)
class Tick:
    time: datetime
    bid: float
    ask: float
    bid_volume: float = 0.0
    ask_volume: float = 0.0


_RECORD = struct.Struct(">IIIff")
_RECORD_SIZE = _RECORD.size  # 20


def decode_bi5(data: bytes) -> bytes:
    """Decompress Dukascopy's bi5 (LZMA1 ALONE format). Empty/short input
    returns empty (an empty file means "no ticks this hour")."""
    if not data or len(data) < 13:  # LZMA1 header is 13 bytes
        return b""
    decomp = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
    return decomp.decompress(data)


def parse_ticks(raw: bytes, hour_start: datetime, point: int) -> list[Tick]:
    """Parse decompressed bi5 bytes into a list of `Tick`."""
    if not raw:
        return []
    if len(raw) % _RECORD_SIZE:
        raise ValueError(
            f"bi5 payload length {len(raw)} is not a multiple of {_RECORD_SIZE}; "
            "data may be corrupt"
        )
    if hour_start.tzinfo is None:
        hour_start = hour_start.replace(tzinfo=timezone.utc)
    ticks: list[Tick] = []
    for off in range(0, len(raw), _RECORD_SIZE):
        ms, ask_raw, bid_raw, ask_vol, bid_vol = _RECORD.unpack_from(raw, off)
        ticks.append(Tick(
            time=hour_start + timedelta(milliseconds=ms),
            bid=bid_raw / point,
            ask=ask_raw / point,
            bid_volume=bid_vol,
            ask_volume=ask_vol,
        ))
    return ticks


def ticks_to_bars(ticks: list[Tick], timeframe: str) -> list[Bar]:
    """Aggregate ticks into closed OHLC bars at the given timeframe.

    Mid price = (bid+ask)/2. Bar `time` is the bar OPEN time, UTC. The
    final partial bar is included (so callers can continue aggregation
    across hour boundaries by stitching results)."""
    if timeframe not in TIMEFRAME_SECONDS:
        raise ValueError(f"unknown timeframe {timeframe!r}")
    tf = TIMEFRAME_SECONDS[timeframe]
    bars: list[Bar] = []
    cur: Bar | None = None
    for t in ticks:
        epoch = int(t.time.timestamp())
        bar_open_ts = epoch - (epoch % tf)
        bar_open = datetime.fromtimestamp(bar_open_ts, tz=timezone.utc)
        mid = (t.bid + t.ask) / 2.0
        if cur is None or bar_open > cur.time:
            if cur is not None:
                bars.append(cur)
            cur = Bar(time=bar_open, open=mid, high=mid, low=mid, close=mid, volume=1)
        else:
            cur.high = max(cur.high, mid)
            cur.low = min(cur.low, mid)
            cur.close = mid
            cur.volume += 1
    if cur is not None:
        bars.append(cur)
    return bars


def _hour_url(instrument: str, t: datetime) -> str:
    return (
        "https://datafeed.dukascopy.com/datafeed/"
        f"{instrument}/{t.year:04d}/{t.month - 1:02d}/{t.day:02d}/"
        f"{t.hour:02d}h_ticks.bi5"
    )


def _hour_iter(start: datetime, end: datetime) -> list[datetime]:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    start = start.replace(minute=0, second=0, microsecond=0)
    out: list[datetime] = []
    cur = start
    while cur < end:
        out.append(cur)
        cur += timedelta(hours=1)
    return out


class DukascopyClient:
    """Async downloader with on-disk cache.

    Cache layout: `<cache_dir>/<INSTRUMENT>/<YYYY>/<MM-1:02d>/<DD:02d>/<HH:02d>h_ticks.bi5`
    (mirrors the URL path so it's debuggable). One file per UTC hour.

    Concurrency is bounded; respect Dukascopy's CDN."""

    BASE = "https://datafeed.dukascopy.com/datafeed"
    USER_AGENT = "Mozilla/5.0 (compatible; dnk-bot/0.1)"

    def __init__(
        self,
        cache_dir: str | Path = ".cache/dukascopy",
        max_concurrency: int = 4,
        timeout: float = 30.0,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._sem = asyncio.Semaphore(max_concurrency)
        self._timeout = timeout

    def _cache_path(self, instrument: str, t: datetime) -> Path:
        return (
            self.cache_dir / instrument
            / f"{t.year:04d}" / f"{t.month - 1:02d}" / f"{t.day:02d}"
            / f"{t.hour:02d}h_ticks.bi5"
        )

    async def _fetch_one(self, client: httpx.AsyncClient, instrument: str, t: datetime) -> bytes:
        path = self._cache_path(instrument, t)
        if path.exists():
            return path.read_bytes()
        async with self._sem:
            r = await client.get(_hour_url(instrument, t), timeout=self._timeout)
        if r.status_code == 404:
            data = b""
        else:
            r.raise_for_status()
            data = r.content
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return data

    async def fetch_hour(
        self, client: httpx.AsyncClient, instrument: str, t: datetime
    ) -> list[Tick]:
        if instrument not in POINT_VALUES:
            raise KeyError(f"unknown instrument {instrument!r}; add to POINT_VALUES")
        raw = await self._fetch_one(client, instrument, t)
        return parse_ticks(decode_bi5(raw), t.replace(minute=0, second=0, microsecond=0), POINT_VALUES[instrument])

    async def fetch_range_ticks(
        self, instrument: str, start: datetime, end: datetime
    ) -> AsyncIterator[Tick]:
        """Yield ticks across [start, end). Order is by hour, then by
        timestamp within each hour (matches Dukascopy's file ordering)."""
        async with httpx.AsyncClient(headers={"User-Agent": self.USER_AGENT}) as client:
            for hour in _hour_iter(start, end):
                ticks = await self.fetch_hour(client, instrument, hour)
                for t in ticks:
                    if start <= t.time < end:
                        yield t

    async def fetch_range_bars(
        self, instrument: str, start: datetime, end: datetime, timeframe: str = "M1"
    ) -> list[Bar]:
        """Convenience: download a date range and aggregate to bars at
        the given timeframe. Returns a flat list (oldest first)."""
        ticks: list[Tick] = []
        async for t in self.fetch_range_ticks(instrument, start, end):
            ticks.append(t)
        return ticks_to_bars(ticks, timeframe)
