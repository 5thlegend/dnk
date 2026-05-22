"use client";

import { useState, useTransition } from "react";

export function CaptureForm() {
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    transmissionId?: string;
    error?: string;
    cinematicLine?: string;
  } | null>(null);

  function submit() {
    if (!note.trim()) return;
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note, url: url || undefined }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          transmission_id?: string;
          cinematic_one_liner?: string;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `status ${res.status}`);
        }
        setResult({
          transmissionId: data.transmission_id,
          cinematicLine: data.cinematic_one_liner,
        });
        setNote("");
        setUrl("");
      } catch (e) {
        setResult({ error: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="cinematic block mb-2">note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="shipped the v2 ingest pipeline today. killed the legacy worker that's been a tax for 8 months."
          rows={6}
          className="w-full bg-line/40 border border-line focus:border-fg/40 px-3 py-2 text-sm leading-relaxed outline-none resize-y"
        />
      </div>
      <div>
        <label className="cinematic block mb-2">url (optional)</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full mono bg-line/40 border border-line focus:border-fg/40 px-3 py-2 text-sm outline-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending || !note.trim()}
          className="bg-fg text-bg mono text-xs px-4 py-2 hover:bg-accent transition disabled:opacity-40"
        >
          {pending ? "transmitting…" : "fire transmission"}
        </button>
        {pending ? (
          <span className="mono text-xs text-muted">
            ingest → generate → store · ~20–40s
          </span>
        ) : null}
      </div>

      {result?.transmissionId ? (
        <div className="border border-line p-4 mt-6">
          <div className="cinematic mb-2">transmission received</div>
          {result.cinematicLine ? (
            <p className="text-sm mb-3">{result.cinematicLine}</p>
          ) : null}
          <a
            href={`/transmission/${result.transmissionId}`}
            className="mono text-xs underline hover:text-accent"
          >
            open the pack →
          </a>
        </div>
      ) : null}

      {result?.error ? (
        <div className="border border-red-500/40 p-4 mt-6">
          <div className="cinematic mb-2">engine error</div>
          <p className="mono text-xs text-red-300">{result.error}</p>
        </div>
      ) : null}
    </div>
  );
}
