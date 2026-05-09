from __future__ import annotations

import math
from typing import Sequence


def ema(values: Sequence[float], length: int) -> list[float]:
    """Exponential moving average matching Pine `ta.ema`.

    alpha = 2 / (length + 1). Seeded with the first value (Pine seeds with
    SMA over the first `length` bars; the difference disappears within a
    few `length` periods of warmup, which the strategy guarantees by
    waiting for >= 200 bars before trading)."""
    if length <= 0:
        raise ValueError("length must be > 0")
    if not values:
        return []
    alpha = 2.0 / (length + 1)
    out: list[float] = [values[0]]
    for v in values[1:]:
        out.append(alpha * v + (1 - alpha) * out[-1])
    return out


def rma(values: Sequence[float], length: int) -> list[float]:
    """Wilder's smoothing (RMA), used by Pine `ta.rsi`.

    Seeded with SMA of the first `length` values (Pine behavior)."""
    if length <= 0:
        raise ValueError("length must be > 0")
    n = len(values)
    out: list[float] = [math.nan] * n
    if n < length:
        return out
    seed = sum(values[:length]) / length
    out[length - 1] = seed
    alpha = 1.0 / length
    for i in range(length, n):
        out[i] = alpha * values[i] + (1 - alpha) * out[i - 1]
    return out


def rsi(closes: Sequence[float], length: int) -> list[float]:
    """RSI per Pine `ta.rsi` (Wilder smoothing)."""
    n = len(closes)
    if n < 2:
        return [math.nan] * n
    gains = [0.0]
    losses = [0.0]
    for i in range(1, n):
        change = closes[i] - closes[i - 1]
        gains.append(change if change > 0 else 0.0)
        losses.append(-change if change < 0 else 0.0)

    avg_gain = rma(gains, length)
    avg_loss = rma(losses, length)

    out: list[float] = []
    for g, l in zip(avg_gain, avg_loss):
        if math.isnan(g) or math.isnan(l):
            out.append(math.nan)
        elif l == 0:
            out.append(100.0)
        else:
            rs = g / l
            out.append(100.0 - 100.0 / (1.0 + rs))
    return out


def sma(values: Sequence[float], length: int) -> list[float]:
    if length <= 0:
        raise ValueError("length must be > 0")
    n = len(values)
    out: list[float] = [math.nan] * n
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= length:
            s -= values[i - length]
        if i >= length - 1:
            out[i] = s / length
    return out
