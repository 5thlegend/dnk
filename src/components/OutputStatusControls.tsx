"use client";

import { useState, useTransition } from "react";
import type { OutputStatus } from "@/lib/types";

const FLOW: { from: OutputStatus[]; to: OutputStatus; label: string }[] = [
  { from: ["draft", "edited"], to: "scheduled", label: "Schedule" },
  { from: ["draft", "edited", "scheduled"], to: "posted", label: "Mark posted" },
  { from: ["draft", "edited", "scheduled", "posted"], to: "killed", label: "Kill" },
];

export function OutputStatusControls({
  outputId,
  status,
}: {
  outputId: string;
  status: OutputStatus;
}) {
  const [current, setCurrent] = useState<OutputStatus>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex items-center gap-2 mt-3">
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
      {error ? <span className="mono text-[11px] text-red-400">{error}</span> : null}
    </div>
  );
}
