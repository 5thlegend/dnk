from datetime import datetime, timedelta, timezone

from bot.marketdata import Bar
from bot.strategy.impulse import ImpulseEngine


def _make_bars_path(segments: list[tuple[float, float, int]]) -> list[Bar]:
    """Build a bar series by linearly interpolating each (start, end, n_bars)
    segment. Each bar advances by `(end-start)/n_bars` -- chosen small
    enough that single bars don't clear the ZigZag threshold."""
    base = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    bars: list[Bar] = []
    prev = segments[0][0] if segments else 0.0
    for start, end, n in segments:
        for i in range(1, n + 1):
            target = start + (end - start) * i / n
            o = prev
            c = target
            bars.append(Bar(
                time=base + timedelta(minutes=len(bars)),
                open=o, high=max(o, c), low=min(o, c), close=c, volume=1,
            ))
            prev = target
    return bars


def test_no_pivots_on_flat_series():
    eng = ImpulseEngine(zz_pct=0.5)
    bars = _make_bars_path([(1.10, 1.10001, 50)])  # micro drift, well under threshold
    eng.process_history(bars)
    assert len(eng.state.pivots) == 0
    assert len(eng.state.legs) == 0


def test_detects_alternating_pivots():
    eng = ImpulseEngine(zz_pct=0.5)  # 50-pip threshold at price ~1.0
    bars = _make_bars_path([
        (1.0000, 0.9920, 30),  # down 80 pips  -> seeds first HIGH pivot
        (0.9920, 1.0050, 50),  # up 130 pips
        (1.0050, 0.9970, 30),  # down 80 pips
        (0.9970, 1.0080, 40),  # up 110 pips
    ])
    eng.process_history(bars)
    assert len(eng.state.pivots) >= 3
    dirs = [p.direction for p in eng.state.pivots]
    for a, b in zip(dirs, dirs[1:]):
        assert a != b, f"non-alternating pivots: {dirs}"


def test_triple_bull_pattern_marks_freshness():
    """7 segments produce 7 pivots and 6 legs. The last 5 legs form a
    bull triple (up, down, up, down, up) with corrections clearly under
    80% of the impulses. The engine should flag last_triple_bull_bar."""
    eng = ImpulseEngine(zz_pct=0.5)  # 50-pip threshold

    bars = _make_bars_path([
        (1.0000, 0.9920, 30),  # initial decline 80p -> HIGH pivot @ 1.0000
        (0.9920, 1.0000, 30),  # leg2 up 80p (impulse 1)
        (1.0000, 0.9945, 25),  # leg3 down 55p (correction 1, < 0.8*80)
        (0.9945, 1.0025, 30),  # leg4 up 80p (impulse 2)
        (1.0025, 0.9970, 25),  # leg5 down 55p (correction 2)
        (0.9970, 1.0050, 30),  # leg6 up 80p (impulse 3)
        (1.0050, 0.9990, 25),  # final decline 60p -> confirms last pivot
    ])
    eng.process_history(bars)

    assert eng.state.last_triple_bull_bar > 0, (
        f"no triple bull detected. legs={list(eng.state.legs)}"
    )
    assert eng.is_bull_fresh(len(bars) - 1, max_age=30)
    assert not eng.is_bear_fresh(len(bars) - 1, max_age=10)


def test_idempotent_process_history():
    eng = ImpulseEngine(zz_pct=0.5)
    bars = _make_bars_path([
        (1.0000, 0.9930, 25),
        (0.9930, 1.0040, 30),
        (1.0040, 0.9970, 25),
    ])
    eng.process_history(bars)
    pivots1 = list(eng.state.pivots)
    legs1 = list(eng.state.legs)

    eng.process_history(bars)
    assert list(eng.state.pivots) == pivots1
    assert list(eng.state.legs) == legs1
