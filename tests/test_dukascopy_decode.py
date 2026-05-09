"""Tests for the Dukascopy bi5 binary parser. The downloader itself
hits a remote CDN and is not exercised here -- but the parsing math is
deterministic and easy to verify."""

import lzma
import struct
from datetime import datetime, timezone

from bot.data.dukascopy import (
    POINT_VALUES,
    decode_bi5,
    parse_ticks,
    ticks_to_bars,
)


def _make_bi5(records: list[tuple[int, int, int, float, float]]) -> bytes:
    """Pack records into raw form, then compress with LZMA1 ALONE format
    (matches Dukascopy's actual output format)."""
    raw = b"".join(struct.pack(">IIIff", *r) for r in records)
    comp = lzma.LZMACompressor(format=lzma.FORMAT_ALONE)
    return comp.compress(raw) + comp.flush()


def test_decode_bi5_roundtrip():
    records = [
        (0, 108543, 108523, 1.0, 1.5),       # at hour start
        (1500, 108550, 108530, 0.4, 0.4),    # 1.5s later
        (3_600_000 - 1, 108600, 108580, 2.0, 1.0),  # last ms of the hour
    ]
    blob = _make_bi5(records)
    raw = decode_bi5(blob)
    hour = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    ticks = parse_ticks(raw, hour, POINT_VALUES["EURUSD"])

    assert len(ticks) == 3
    assert ticks[0].time == hour
    assert abs(ticks[0].ask - 1.08543) < 1e-9
    assert abs(ticks[0].bid - 1.08523) < 1e-9
    assert ticks[0].ask_volume == 1.0
    assert ticks[0].bid_volume == 1.5
    # 1.5 seconds in
    assert (ticks[1].time - hour).total_seconds() == 1.5
    # near hour end
    assert ticks[2].time.minute == 59 and ticks[2].time.second == 59


def test_decode_empty_returns_empty():
    assert decode_bi5(b"") == b""
    assert decode_bi5(b"\x00") == b""
    assert parse_ticks(b"", datetime(2025, 1, 1, tzinfo=timezone.utc), 100_000) == []


def test_ticks_to_bars_m1_aggregation():
    hour = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    blob = _make_bi5([
        # Three ticks in minute 0 -> one M1 bar
        (0, 108540, 108530, 1, 1),
        (10_000, 108550, 108540, 1, 1),
        (50_000, 108555, 108545, 1, 1),
        # Two ticks in minute 1 -> second M1 bar
        (60_000, 108520, 108510, 1, 1),
        (90_000, 108560, 108550, 1, 1),
    ])
    ticks = parse_ticks(decode_bi5(blob), hour, POINT_VALUES["EURUSD"])
    bars = ticks_to_bars(ticks, "M1")
    assert len(bars) == 2
    b0, b1 = bars
    assert b0.time == hour
    # Mid prices: (1.08545+ +1.08550 + 1.08555)/2 of bid+ask
    # First tick mid = (1.08530+1.08540)/2 = 1.08535
    assert abs(b0.open - 1.08535) < 1e-9
    # b0.close = mid of last tick in minute 0 = (1.08545+1.08555)/2 = 1.08550
    assert abs(b0.close - 1.08550) < 1e-9
    assert b0.high >= b0.open and b0.low <= b0.open
    assert b1.time == hour.replace(minute=1)


def test_jpy_pair_uses_smaller_point_value():
    hour = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    blob = _make_bi5([(0, 152_345, 152_325, 1, 1)])
    ticks = parse_ticks(decode_bi5(blob), hour, POINT_VALUES["USDJPY"])
    assert abs(ticks[0].ask - 152.345) < 1e-9
    assert abs(ticks[0].bid - 152.325) < 1e-9
