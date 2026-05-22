import Link from "next/link";
import { listTransmissions } from "@/lib/supabase";
import type { TransmissionWithOutputs } from "@/lib/types";
import { CHANNEL_LABELS, type Channel } from "@/lib/prompts";

export const runtime = "edge";
export const revalidate = 0;

function envOrEmpty(name: string): string {
  return process.env[name] ?? "";
}

async function loadTransmissions(): Promise<TransmissionWithOutputs[]> {
  const url = envOrEmpty("NEXT_PUBLIC_SUPABASE_URL");
  const key = envOrEmpty("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return [];
  try {
    return await listTransmissions(url, key, 60);
  } catch (e) {
    console.error("loadTransmissions", e);
    return [];
  }
}

const STATUS_COLUMNS = ["draft", "scheduled", "posted"] as const;

export default async function HomePage() {
  const transmissions = await loadTransmissions();

  const allOutputs = transmissions.flatMap((t) =>
    t.outputs.map((o) => ({ ...o, transmission: t })),
  );
  const grouped: Record<(typeof STATUS_COLUMNS)[number], typeof allOutputs> = {
    draft: [],
    scheduled: [],
    posted: [],
  };
  for (const o of allOutputs) {
    if (o.status === "draft" || o.status === "edited") grouped.draft.push(o);
    else if (o.status === "scheduled") grouped.scheduled.push(o);
    else if (o.status === "posted") grouped.posted.push(o);
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line px-8 py-6 flex items-baseline justify-between gap-4">
        <div>
          <div className="cinematic">General Dank · Content Engine</div>
          <h1 className="mt-2 text-2xl font-medium tracking-tight">
            Realtime transmission console
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="mono text-xs text-muted">
            {transmissions.length} transmissions · {allOutputs.length} outputs
          </div>
          <Link
            href="/capture"
            className="mono text-xs px-3 py-2 bg-fg text-bg hover:bg-accent transition"
          >
            + fire transmission
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-line">
        {STATUS_COLUMNS.map((status) => (
          <div
            key={status}
            className="border-r border-line last:border-r-0 px-6 py-6 min-h-[60vh]"
          >
            <div className="flex items-baseline justify-between mb-4">
              <div className="cinematic">{status}</div>
              <div className="mono text-xs text-muted">
                {grouped[status].length}
              </div>
            </div>
            <div className="space-y-3">
              {grouped[status].slice(0, 30).map((o) => (
                <OutputCard
                  key={o.id}
                  channel={o.channel as Channel}
                  body={o.body}
                  transmissionId={o.transmission_id}
                  cinematicLine={o.transmission.outputs.find(
                    (x) => x.channel === "cinematic_one_liner",
                  )?.body as string | undefined}
                />
              ))}
              {grouped[status].length === 0 ? (
                <div className="text-muted text-sm mono">— empty —</div>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className="px-8 py-8">
        <div className="cinematic mb-4">Recent transmissions</div>
        <div className="space-y-2">
          {transmissions.slice(0, 20).map((t) => {
            const cl = t.outputs.find((o) => o.channel === "cinematic_one_liner")
              ?.body as string | undefined;
            return (
              <Link
                key={t.id}
                href={`/transmission/${t.id}`}
                className="block border border-line hover:border-fg/40 px-4 py-3 transition"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{cl ?? t.raw_input.slice(0, 120)}</div>
                    <div className="mono text-xs text-muted mt-1 truncate">
                      {t.raw_input.slice(0, 200)}
                    </div>
                  </div>
                  <div className="mono text-xs text-muted shrink-0">
                    {new Date(t.created_at).toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              </Link>
            );
          })}
          {transmissions.length === 0 ? (
            <EmptyState />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function OutputCard({
  channel,
  body,
  transmissionId,
  cinematicLine,
}: {
  channel: Channel;
  body: unknown;
  transmissionId: string;
  cinematicLine?: string;
}) {
  const preview = typeof body === "string"
    ? body
    : Array.isArray(body)
    ? body.join("  ·  ")
    : typeof body === "object" && body && "hook" in (body as object)
    ? (body as { hook: string }).hook
    : JSON.stringify(body);
  return (
    <Link
      href={`/transmission/${transmissionId}`}
      className="block border border-line hover:border-fg/40 px-3 py-3 transition"
    >
      <div className="cinematic mb-2">{CHANNEL_LABELS[channel]}</div>
      <div className="text-sm leading-snug line-clamp-4">{preview}</div>
      {cinematicLine ? (
        <div className="mono text-xs text-muted mt-2 truncate">
          ↳ {cinematicLine}
        </div>
      ) : null}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border border-line border-dashed px-6 py-12 text-center">
      <div className="cinematic mb-4">Engine idle</div>
      <p className="text-sm text-muted max-w-md mx-auto">
        No transmissions yet. Fire <span className="mono text-fg">/dank</span> in
        Discord with a note, voice memo, or screenshot — the engine will return a
        full content pack in under a minute.
      </p>
    </div>
  );
}
