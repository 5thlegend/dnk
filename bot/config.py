from enum import Enum

from pydantic import BaseModel, Field


class Mode(str, Enum):
    MOCK = "mock"
    DEMO = "demo"
    LIVE = "live"


class StrategyName(str, Enum):
    NOOP = "noop"
    MMLFX = "mmlfx"


class MMLFXSettings(BaseModel):
    """Inputs from the Pine source, grouped logically. Defaults match the
    Pine defaults exactly; the bot reproduces those without any tuning."""

    auto_phase: bool = True
    manual_phase: str = "MICRO"
    max_trades_day: int = Field(3, ge=1, le=8)

    micro_sl_pips: float = Field(4.0, ge=2.0, le=8.0)
    micro_tp_pips: float = Field(4.0, ge=2.0, le=8.0)
    micro_ema_fast: int = Field(8, ge=3, le=20)
    micro_ema_slow: int = Field(21, ge=10, le=50)
    micro_rsi_length: int = Field(7, ge=3, le=14)
    micro_rsi_ob: float = Field(65.0, ge=55, le=80)
    micro_rsi_os: float = Field(35.0, ge=20, le=45)
    micro_min_candle_x_avg: float = Field(1.1, ge=0.8, le=2.0)

    breakout_risk_pct: float = Field(2.0, ge=0.5, le=5.0)
    breakout_rr: float = Field(1.0, ge=0.5, le=3.0)
    asia_start: int = Field(22, ge=0, le=23)
    asia_end: int = Field(6, ge=0, le=23)
    trade_start: int = Field(7, ge=0, le=23)
    trade_end: int = Field(16, ge=0, le=23)
    close_all_hour: int = Field(20, ge=0, le=23)
    min_range_pips: float = Field(15.0, ge=5)
    max_range_pips: float = Field(60.0, ge=30)
    break_buffer_pips: float = Field(3.0, ge=0)

    use_london: bool = True
    use_ny: bool = True
    london_start: int = Field(7, ge=0, le=23)
    london_end: int = Field(11, ge=0, le=23)
    ny_start: int = Field(12, ge=0, le=23)
    ny_end: int = Field(16, ge=0, le=23)


class Settings(BaseModel):
    mode: Mode = Mode.MOCK
    symbol: str = "EURUSD"
    timeframe: str = "M1"
    starting_balance: float = 5.0

    strategy: StrategyName = StrategyName.MMLFX
    mmlfx: MMLFXSettings = Field(default_factory=MMLFXSettings)

    risk_per_trade_pct: float = Field(1.0, ge=0.0, le=100.0)
    max_daily_loss_pct: float = Field(10.0, ge=0.0, le=100.0)
    max_open_positions: int = Field(1, ge=1, le=20)
    poll_interval_seconds: float = Field(1.0, gt=0.0)

    mt5_login: int | None = None
    mt5_password: str | None = None
    mt5_server: str | None = None
