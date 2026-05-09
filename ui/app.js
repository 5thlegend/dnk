const API = (location.origin.startsWith("http") ? location.origin : "http://localhost:8000");

const $ = (sel) => document.querySelector(sel);
const badge = $("#badge");
const strategyTag = $("#strategyTag");
const errorEl = $("#error");
const startBtn = $("#startBtn");
const stopBtn = $("#stopBtn");
const coreForm = $("#coreForm");
const mmlfxForm = $("#mmlfxForm");
const saveBtn = $("#saveBtn");

const NUMERIC_KEYS = new Set([
  "starting_balance", "risk_per_trade_pct", "max_daily_loss_pct", "poll_interval_seconds",
  "micro_sl_pips", "micro_tp_pips", "micro_min_candle_x_avg",
  "micro_rsi_ob", "micro_rsi_os",
  "breakout_risk_pct", "breakout_rr",
  "min_range_pips", "max_range_pips", "break_buffer_pips",
  "zz_pct_threshold",
]);
const INT_KEYS = new Set([
  "max_open_positions",
  "max_trades_day", "micro_ema_fast", "micro_ema_slow", "micro_rsi_length",
  "asia_start", "asia_end", "trade_start", "trade_end", "close_all_hour",
  "london_start", "london_end", "ny_start", "ny_end",
  "impulse_max_age_bars",
]);

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

function showError(msg) {
  if (!msg) { errorEl.hidden = true; errorEl.textContent = ""; return; }
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function setBadge(status) {
  badge.className = "badge " + status;
  badge.textContent = status;
}

function setFieldValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (!field) return;
  if (field.type === "checkbox") {
    field.checked = !!value;
  } else {
    field.value = value ?? "";
  }
}

function loadSettings(s) {
  // Top-level
  for (const k of ["mode","strategy","symbol","timeframe","starting_balance","risk_per_trade_pct","max_daily_loss_pct","max_open_positions","poll_interval_seconds"]) {
    setFieldValue(coreForm, k, s[k]);
  }
  // Nested mmlfx
  if (s.mmlfx) {
    for (const [k, v] of Object.entries(s.mmlfx)) {
      setFieldValue(mmlfxForm, "mmlfx." + k, v);
    }
  }
  strategyTag.textContent = "strategy: " + (s.strategy ?? "-");
}

function readForms() {
  const out = { mmlfx: {} };
  const coerce = (key, raw) => {
    if (NUMERIC_KEYS.has(key)) return parseFloat(raw);
    if (INT_KEYS.has(key)) return parseInt(raw, 10);
    return raw;
  };

  for (const el of coreForm.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") { out[el.name] = el.checked; continue; }
    out[el.name] = coerce(el.name, el.value);
  }
  for (const el of mmlfxForm.elements) {
    if (!el.name || !el.name.startsWith("mmlfx.")) continue;
    const key = el.name.slice("mmlfx.".length);
    if (el.type === "checkbox") { out.mmlfx[key] = el.checked; continue; }
    out.mmlfx[key] = coerce(key, el.value);
  }
  return out;
}

function renderState(state) {
  setBadge(state.status);
  $('[data-k="status"]').textContent = state.status;
  $('[data-k="balance"]').textContent = state.balance != null ? `$${state.balance.toFixed(2)}` : "-";
  $('[data-k="open_positions"]').textContent = state.open_positions ?? "-";
  $('[data-k="quote"]').textContent = (state.last_bid && state.last_ask)
    ? `${state.last_bid.toFixed(5)} / ${state.last_ask.toFixed(5)}` : "-";
  $('[data-k="tick_count"]').textContent = state.tick_count ?? "-";

  const tbody = $("#trades tbody");
  tbody.innerHTML = "";
  for (const t of (state.trades || []).slice().reverse()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${new Date(t.time).toLocaleTimeString()}</td>
      <td>${t.side}</td><td>${t.volume}</td>
      <td>${t.entry_price?.toFixed?.(5) ?? "-"}</td>
      <td>${t.reason || ""}</td>`;
    tbody.appendChild(tr);
  }

  if (state.last_error) showError(state.last_error); else showError(null);
}

async function refresh() {
  try {
    const data = await api("/api/status");
    loadSettings(data.settings);
    renderState(data.state);
  } catch (e) {
    showError(e.message);
  }
}

startBtn.addEventListener("click", async () => {
  showError(null);
  try { await api("/api/start", { method: "POST" }); await refresh(); }
  catch (e) { showError(e.message); }
});

stopBtn.addEventListener("click", async () => {
  showError(null);
  try { await api("/api/stop", { method: "POST" }); await refresh(); }
  catch (e) { showError(e.message); }
});

mmlfxForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError(null);
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(readForms()) });
    await refresh();
  } catch (e) { showError(e.message); }
});

// "Save settings" lives in the MMLFX form but applies the union of both forms.
refresh();
setInterval(refresh, 1500);
