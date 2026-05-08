from __future__ import annotations

from dataclasses import dataclass

from ..config import MMLFXSettings, Settings
from ..indicators import ema, rsi, sma
from ..marketdata import Bar
from .base import Signal, SignalType, Strategy


def pip_size(symbol: str) -> float:
    """Pine: pip = syminfo.mintick * 10. For 5-decimal forex pairs that's
    0.0001; for 3-decimal JPY pairs it's 0.01."""
    return 0.01 if "JPY" in symbol.upper() else 0.0001


@dataclass
class _MMLFXState:
    last_day: int = -1
    trades_today: int = 0

    micro_buy_taken: bool = False
    micro_sell_taken: bool = False
    micro_last_bar_index: int = -10_000

    asia_on_prev: bool = False
    asia_high: float | None = None
    asia_low: float | None = None
    asia_locked: bool = False

    breakout_buy_taken: bool = False
    breakout_sell_taken: bool = False

    position_side: int = 0  # +1 long, -1 short, 0 flat
    equity: float = 0.0


class MMLFXStrategy(Strategy):
    """Python port of MMLFX v3.3 EUR Printer (Pine v6).

    Two engines, gated by equity:
      MICRO ($ < $30): EMA crossover + RSI band + momentum + pullback,
                      fixed pip SL/TP, 0.01 lots, 5-bar cooldown.
      BREAKOUT ($ >= $30): Asia-range breakout, EMA-200 trend filter,
                          risk-% sizing, configurable R:R.

    Decisions are made on bar close (Pine source has calc_on_every_tick=true,
    but bar-close is more reproducible and safer for a live bot; revisit if
    needed). The Pine source's Impulse Engine subsystem is informational
    only and not ported."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.mmlfx: MMLFXSettings = settings.mmlfx
        self.symbol = settings.symbol
        self.pip = pip_size(self.symbol)
        self.state = _MMLFXState(equity=settings.starting_balance)

    def update_equity(self, equity: float) -> None:
        self.state.equity = equity

    def update_position_side(self, side: int) -> None:
        self.state.position_side = side

    def on_bar_close(self, bars: list[Bar]) -> Signal:
        if len(bars) < 250:
            return Signal(type=SignalType.HOLD, reason="warming up")

        m = self.mmlfx
        last = bars[-1]

        closes = [b.close for b in bars]
        highs = [b.high for b in bars]
        lows = [b.low for b in bars]
        ranges = [h - l for h, l in zip(highs, lows)]

        ef = ema(closes, m.micro_ema_fast)[-1]
        es = ema(closes, m.micro_ema_slow)[-1]
        e200 = ema(closes, 200)[-1]
        rsi_v = rsi(closes, m.micro_rsi_length)[-1]
        avg_c = sma(ranges, 20)[-1]
        c_size = ranges[-1]

        utc_h = last.time.hour
        utc_d = last.time.day
        bar_index = len(bars) - 1

        if utc_d != self.state.last_day:
            self.state.trades_today = 0
            self.state.last_day = utc_d

        eq = self.state.equity
        if m.auto_phase:
            phase = "MICRO" if eq < 30.0 else "BREAKOUT"
        else:
            phase = m.manual_phase

        in_london = m.use_london and m.london_start <= utc_h < m.london_end
        in_ny = m.use_ny and m.ny_start <= utc_h < m.ny_end
        in_session = in_london or in_ny

        can_trade = self.state.trades_today < m.max_trades_day and in_session

        # Pine's `if utcD != tDayN or not iSes` -- by the time it runs,
        # tDayN already equals utcD (set in the day-rollover block above),
        # so the day clause never fires. Effective behavior: reset cooldown
        # flags whenever out of session. We preserve that.
        if not in_session:
            self.state.micro_buy_taken = False
            self.state.micro_sell_taken = False

        # MICRO conditions
        t_bull_mom = ef > es and last.close > es
        t_bear_mom = ef < es and last.close < es
        rsi_bull_zone = 50 < rsi_v < m.micro_rsi_ob
        rsi_bear_zone = m.micro_rsi_os < rsi_v < 50
        big_candle = c_size > avg_c * m.micro_min_candle_x_avg
        last3_low = min(lows[-3:])
        last3_high = max(highs[-3:])
        pull_buy = last3_low <= es and last.close > ef
        pull_sell = last3_high >= es and last.close < ef

        micro_buy = (
            phase == "MICRO" and can_trade and t_bull_mom and rsi_bull_zone
            and big_candle and pull_buy and last.close > last.open
        )
        micro_sell = (
            phase == "MICRO" and can_trade and t_bear_mom and rsi_bear_zone
            and big_candle and pull_sell and last.close < last.open
        )
        cooldown_ok = (bar_index - self.state.micro_last_bar_index) >= 5

        fmB = micro_buy and not self.state.micro_buy_taken and cooldown_ok
        fmS = micro_sell and not self.state.micro_sell_taken and cooldown_ok

        # Asia session range
        as_h, ae_h = m.asia_start, m.asia_end
        if as_h > ae_h:
            asia_on = utc_h >= as_h or utc_h < ae_h
        else:
            asia_on = as_h <= utc_h < ae_h

        asia_started = asia_on and not self.state.asia_on_prev
        asia_ended = (not asia_on) and self.state.asia_on_prev

        if asia_started:
            self.state.asia_high = last.high
            self.state.asia_low = last.low
            self.state.asia_locked = False
            self.state.breakout_buy_taken = False
            self.state.breakout_sell_taken = False
        if asia_on and not self.state.asia_locked:
            if self.state.asia_high is None or self.state.asia_low is None:
                self.state.asia_high = last.high
                self.state.asia_low = last.low
            else:
                self.state.asia_high = max(self.state.asia_high, last.high)
                self.state.asia_low = min(self.state.asia_low, last.low)
        if asia_ended:
            self.state.asia_locked = True

        self.state.asia_on_prev = asia_on

        ts_h, te_h, ca_h = m.trade_start, m.trade_end, m.close_all_hour
        if ts_h < te_h:
            in_trade_window = ts_h <= utc_h < te_h
        else:
            in_trade_window = utc_h >= ts_h or utc_h < te_h
        past_close_all = utc_h >= ca_h

        if (
            self.state.asia_locked
            and self.state.asia_high is not None
            and self.state.asia_low is not None
        ):
            range_size = self.state.asia_high - self.state.asia_low
        else:
            range_size = 0.0
        range_pips = range_size / self.pip
        range_valid = (
            self.state.asia_locked
            and m.min_range_pips <= range_pips <= m.max_range_pips
        )

        buf = m.break_buffer_pips * self.pip
        ahi = self.state.asia_high if self.state.asia_high is not None else 0.0
        alo = self.state.asia_low if self.state.asia_low is not None else 0.0

        breakout_long = (
            range_valid and in_trade_window and not past_close_all
            and last.close > ahi + buf
            and last.close > last.open and last.close > e200
        )
        breakout_short = (
            range_valid and in_trade_window and not past_close_all
            and last.close < alo - buf
            and last.close < last.open and last.close < e200
        )

        fbB = (
            phase == "BREAKOUT" and can_trade and breakout_long
            and not self.state.breakout_buy_taken
        )
        fbS = (
            phase == "BREAKOUT" and can_trade and breakout_short
            and not self.state.breakout_sell_taken
        )

        # End-of-day flatten in BREAKOUT phase
        if phase == "BREAKOUT" and past_close_all and self.state.position_side != 0:
            return Signal(type=SignalType.CLOSE, reason="EOD flatten")

        # Order of precedence: MICRO buy, MICRO sell, BREAKOUT buy, BREAKOUT sell.
        # The two phases are mutually exclusive so at most one fires per bar.
        if fmB:
            self.state.micro_buy_taken = True
            self.state.micro_last_bar_index = bar_index
            self.state.trades_today += 1
            return Signal(
                type=SignalType.BUY, reason="MICRO buy", volume=0.01,
                sl=last.close - m.micro_sl_pips * self.pip,
                tp=last.close + m.micro_tp_pips * self.pip,
            )
        if fmS:
            self.state.micro_sell_taken = True
            self.state.micro_last_bar_index = bar_index
            self.state.trades_today += 1
            return Signal(
                type=SignalType.SELL, reason="MICRO sell", volume=0.01,
                sl=last.close + m.micro_sl_pips * self.pip,
                tp=last.close - m.micro_tp_pips * self.pip,
            )
        if fbB:
            self.state.breakout_buy_taken = True
            self.state.trades_today += 1
            risk_amt = eq * m.breakout_risk_pct / 100.0
            stop_dist = abs(last.close - (alo - buf))
            stop_pips = stop_dist / self.pip
            lots = (
                max(0.01, round(risk_amt / (stop_pips * 10.0) / 0.01) * 0.01)
                if stop_pips > 0 else 0.01
            )
            return Signal(
                type=SignalType.BUY, reason="BREAKOUT buy", volume=lots,
                sl=alo - buf,
                tp=last.close + stop_dist * m.breakout_rr,
            )
        if fbS:
            self.state.breakout_sell_taken = True
            self.state.trades_today += 1
            risk_amt = eq * m.breakout_risk_pct / 100.0
            stop_dist = abs((ahi + buf) - last.close)
            stop_pips = stop_dist / self.pip
            lots = (
                max(0.01, round(risk_amt / (stop_pips * 10.0) / 0.01) * 0.01)
                if stop_pips > 0 else 0.01
            )
            return Signal(
                type=SignalType.SELL, reason="BREAKOUT sell", volume=lots,
                sl=ahi + buf,
                tp=last.close - stop_dist * m.breakout_rr,
            )

        return Signal(type=SignalType.HOLD)
