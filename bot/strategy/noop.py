from .base import Strategy


class NoopStrategy(Strategy):
    """Always-HOLD strategy. Useful when running the engine without a brain
    (e.g. while developing the connector or UI)."""
