"use client";

import { useState, useTransition } from "react";
import type { OutputStatus } from "@/lib/types";
import type { Channel } from "@/lib/prompts";

const FLOW: { from: OutputStatus[]; to: OutputStatus; label: string }[] = [
  { from: ["draft", "edited"], to: "scheduled", label: "Schedule" },
  { from: ["draft", "edited", "scheduled"], to: "posted", label: "Mark posted" },
  { from: ["draft", "edited", "scheduled", "posted"], to: "killed", label: "Kill" },
];

const X_CHANNELS: Channel[] = ["x_post", "x_thread"];

export function OutputStatusControls({
  outputId,
  status,
  channel,
  performance,
}: {
  outputId: string;
  status: OutputStatus;
  channel: Channel;
  performance: Record<string, number> | null;
}) {
  const [current, setCurrent] = useState<OutputStatus>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [perfOpen, setPerfOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  function update(next: OutputStatus) {
    setError(null);
    startTransition(async () => {
      const body: Record<string, unknown> = { status: next };
      if (next === "posted") body.posted_at = new Date().toISOString();
      try {
        const res = await fetch(`/api/outputs/${outputId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setCurrent(next);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function scheduleViaTypefully(scheduledFor: string | null) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/outputs/${outputId}/schedule`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scheduled_for: scheduledFor }),
        });
        if (!res.ok) throw new Error(await res.text());
        setCurrent("scheduled");
        setScheduleOpen(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="cinematic">status: {current}</span>
        {FLOW.filter((f) => f.from.includes(current) && f.to !== current).map((f) => (
          <button
            key={f.to}
            disabled={pending}
            onClick={() => update(f.to)}
            className="mono text-[11px] px-2 py-1 border border-line hover:border-fg/40 transition disabled:opacity-40"
          >
            {f.label}
          </button>
        ))}
        {X_CHANNELS.includes(channel) && current !== "posted" ? (
          <button
            onClick={() => setScheduleOpen((v) => !v)}
            className="mono text-[11px] px-2 py-1 border border-line hover:border-accent transition"
          >
            → Typefully
          </button>
        ) : null}
        {current === "posted" ? (
          <button
            onClick={() => setPerfOpen((v) => !v)}
            className="mono text-[11px] px-2 py-1 border border-line hover:border-fg/40 transition"
          >
            log performance
          </button>
        ) : null}
      </div>
      {scheduleOpen ? <ScheduleForm onSubmit={scheduleViaTypefully} pending={pending} /> : null}
      {perfOpen ? <PerformanceForm outputId={outputId} initial={performance} /> : null}
      {performance && !perfOpen ? <PerformanceSummary perf={performance} /> : null}
      {error ? <span className="mono text-[11px] text-red-400">{error}</span> : null}
    </div>
  );
}

function ScheduleForm({
  onSubmit,
  pending,
}: {
  onSubmit: (iso: string | null) => void;
  pending: boolean;
}) {
  const [when, setWhen] = useState("");
  return (
    <div className="border border-line p-3 flex items-center gap-2">
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="mono text-xs bg-line/40 border border-line px-2 py-1 outline-none"
      />
      <button
        disabled={pending}
        onClick={() => onSubmit(when ? new Date(when).toISOString() : null)}
        className="mono text-[11px] px-3 py-1 bg-fg text-bg hover:bg-accent transition disabled:opacity-40"
      >
        push to Typefully
      </button>
      <span className="mono text-[11px] text-muted">
        leave blank for unscheduled draft
      </span>
    </div>
  );
}

const PERF_FIELDS = ["impressions", "likes", "replies", "reposts", "follows", "saves"];

function PerformanceForm({
  outputId,
  initial,
}: {
  outputId: string;
  initial: Record<string, number> | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of PERF_FIELDS) v[f] = initial?.[f]?.toString() ?? "";
    return v;
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startTransition(async () => {
      const body: Record<string, number> = {};
      for (const [k, v] of Object.entries(values)) {
        const n = Number(v);
        if (!Number.isNaN(n) && v !== "") body[k] = n;
      }
      await fetch(`/api/outputs/${outputId}/performance`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="border border-line p-3 grid grid-cols-3 gap-2">
      {PERF_FIELDS.map((f) => (
        <label key={f} className="flex flex-col gap-1">
          <span className="cinematic">{f}</span>
          <input
            value={values[f]}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            inputMode="numeric"
            className="mono text-xs bg-line/40 border border-line px-2 py-1 outline-none"
          />
        </label>
      ))}
      <button
        onClick={save}
        disabled={pending}
        className="col-span-3 mono text-[11px] px-3 py-2 bg-fg text-bg hover:bg-accent transition disabled:opacity-40"
      >
        {pending ? "saving…" : saved ? "saved ✓" : "save"}
      </button>
    </div>
  );
}

function PerformanceSummary({ perf }: { perf: Record<string, number> }) {
  return (
    <div className="mono text-[11px] text-muted flex flex-wrap gap-3">
      {Object.entries(perf).map(([k, v]) => (
        <span key={k}>
          {k}: <span className="text-fg">{v.toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}
