import math

from bot.indicators import ema, rma, rsi, sma


def test_ema_constant_series_returns_constant():
    assert ema([5.0] * 50, 10) == [5.0] * 50


def test_ema_alpha_first_step():
    out = ema([0.0, 10.0], 9)
    alpha = 2.0 / (9 + 1)
    assert out[0] == 0.0
    assert math.isclose(out[1], alpha * 10.0, rel_tol=1e-9)


def test_sma_window():
    out = sma([1.0, 2.0, 3.0, 4.0, 5.0], 3)
    assert all(math.isnan(x) for x in out[:2])
    assert out[2:] == [2.0, 3.0, 4.0]


def test_rma_seeds_with_sma():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    out = rma(values, 3)
    assert all(math.isnan(x) for x in out[:2])
    assert math.isclose(out[2], 2.0)  # SMA(1,2,3)
    # RMA step: alpha=1/3 -> next = (1/3)*4 + (2/3)*2
    assert math.isclose(out[3], (4.0 / 3.0) + (4.0 / 3.0))


def test_rsi_all_gains_is_100():
    closes = [float(i) for i in range(1, 50)]
    out = rsi(closes, 14)
    assert math.isclose(out[-1], 100.0, rel_tol=1e-6)


def test_rsi_all_losses_is_0():
    closes = [float(50 - i) for i in range(50)]
    out = rsi(closes, 14)
    assert math.isclose(out[-1], 0.0, abs_tol=1e-6)


def test_rsi_alternating_around_50():
    closes = [100.0]
    for _ in range(60):
        closes.append(closes[-1] + 1.0 if len(closes) % 2 else closes[-1] - 1.0)
    out = rsi(closes, 14)
    assert 30.0 <= out[-1] <= 70.0
