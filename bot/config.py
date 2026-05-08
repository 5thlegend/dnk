from enum import Enum
from pydantic import BaseModel, Field


class Mode(str, Enum):
    MOCK = "mock"
    DEMO = "demo"
    LIVE = "live"


class Settings(BaseModel):
    mode: Mode = Mode.MOCK
    symbol: str = "EURUSD"
    timeframe: str = "M1"
    starting_balance: float = 5.0
    risk_per_trade_pct: float = Field(1.0, ge=0.0, le=100.0)
    max_daily_loss_pct: float = Field(10.0, ge=0.0, le=100.0)
    max_open_positions: int = Field(1, ge=1, le=20)
    poll_interval_seconds: float = Field(1.0, gt=0.0)

    mt5_login: int | None = None
    mt5_password: str | None = None
    mt5_server: str | None = None
