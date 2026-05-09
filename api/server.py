from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from bot.config import Settings
from bot.engine import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="dnk MT5 bot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
async def status() -> dict:
    return {
        "settings": engine.settings.model_dump(),
        "state": engine.state.to_dict(),
    }


@app.put("/api/settings")
async def update_settings(settings: Settings) -> dict:
    try:
        engine.update_settings(settings)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "settings": engine.settings.model_dump()}


@app.post("/api/start")
async def start() -> dict:
    await engine.start()
    return {"ok": True, "state": engine.state.to_dict()}


@app.post("/api/stop")
async def stop() -> dict:
    await engine.stop()
    return {"ok": True, "state": engine.state.to_dict()}


_UI_DIR = Path(__file__).resolve().parent.parent / "ui"
if _UI_DIR.is_dir():
    app.mount("/", StaticFiles(directory=_UI_DIR, html=True), name="ui")
