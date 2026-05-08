const API = (location.origin.startsWith("http") ? location.origin : "http://localhost:8000");

const $ = (sel) => document.querySelector(sel);
const badge = $("#badge");
const errorEl = $("#error");
const startBtn = $("#startBtn");
const stopBtn = $("#stopBtn");
const form = $("#settingsForm");

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

function loadSettingsIntoForm(s) {
  for (const [k, v] of Object.entries(s)) {
    const field = form.elements.namedItem(k);
    if (field) field.value = v ?? "";
  }
}

function readSettingsFromForm() {
  const fd = new FormData(form);
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (["starting_balance","risk_per_trade_pct","max_daily_loss_pct","poll_interval_seconds"].includes(k)) out[k] = parseFloat(v);
    else if (k === "max_open_positions") out[k] = parseInt(v, 10);
    else out[k] = v;
  }
  return out;
}

function renderState(state) {
  setBadge(state.status);
  $('[data-k="status"]').textContent = state.status;
  $('[data-k="balance"]').textContent = state.balance != null ? `$${state.balance.toFixed(2)}` : "—";
  $('[data-k="open_positions"]').textContent = state.open_positions ?? "—";
  $('[data-k="quote"]').textContent = (state.last_bid && state.last_ask)
    ? `${state.last_bid.toFixed(5)} / ${state.last_ask.toFixed(5)}` : "—";
  $('[data-k="tick_count"]').textContent = state.tick_count ?? "—";

  const tbody = $("#trades tbody");
  tbody.innerHTML = "";
  for (const t of (state.trades || []).slice().reverse()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${new Date(t.time).toLocaleTimeString()}</td>
      <td>${t.side}</td><td>${t.volume}</td>
      <td>${t.entry_price?.toFixed?.(5) ?? "—"}</td>
      <td>${t.reason || ""}</td>`;
    tbody.appendChild(tr);
  }

  if (state.last_error) showError(state.last_error); else showError(null);
}

async function refresh() {
  try {
    const data = await api("/api/status");
    loadSettingsIntoForm(data.settings);
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

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError(null);
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(readSettingsFromForm()) });
    await refresh();
  } catch (e) { showError(e.message); }
});

refresh();
setInterval(refresh, 1500);
