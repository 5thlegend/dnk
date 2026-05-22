import Link from "next/link";
import { notFound } from "next/navigation";
import { getTransmission } from "@/lib/supabase";
import { CHANNEL_LABELS, type Channel } from "@/lib/prompts";

export const runtime = "edge";
export const revalidate = 0;

export default async function TransmissionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) notFound();
  const tx = await getTransmission(url, key, id);
  if (!tx) notFound();

  const cinematic = tx.outputs.find((o) => o.channel === "cinematic_one_liner");
  const ordered: Channel[] = [
    "cinematic_one_liner",
    "x_post",
    "x_thread",
    "ig_caption",
    "reel_concept",
    "founder_transmission",
    "deployment_log",
    "linkedin_post",
    "team_in_bio",
    "cta_opportunity",
  ];

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line px-8 py-6">
        <Link href="/" className="cinematic hover:text-fg">
          ← console
        </Link>
        <div className="mt-4 flex items-baseline justify-between">
          <div className="cinematic">
            transmission · {tx.id.slice(0, 8)}
          </div>
          <div className="mono text-xs text-muted">
            {new Date(tx.created_at).toISOString().replace("T", " ").slice(0, 19)}
            {" · "}
            {tx.generation_model}
          </div>
        </div>
        {cinematic ? (
          <h1 className="mt-4 text-3xl md:text-4xl font-medium tracking-tight max-w-3xl">
            {cinematic.body as string}
          </h1>
        ) : null}
      </header>

      <section className="px-8 py-6 border-b border-line bg-line/30">
        <div className="cinematic mb-2">raw input</div>
        <pre className="mono text-sm whitespace-pre-wrap max-w-3xl">
          {tx.raw_input}
        </pre>
        {tx.ingest_summary ? (
          <>
            <div className="cinematic mb-2 mt-6">ingest summary</div>
            <pre className="mono text-xs text-muted whitespace-pre-wrap max-w-3xl">
              {tx.ingest_summary}
            </pre>
          </>
        ) : null}
      </section>

      <section className="px-8 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
        {ordered
          .filter((c) => c !== "cinematic_one_liner")
          .map((channel) => {
            const o = tx.outputs.find((x) => x.channel === channel);
            if (!o) return null;
            return (
              <article key={o.id} className="border border-line p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="cinematic">{CHANNEL_LABELS[channel]}</div>
                  <div className="mono text-xs text-muted">{o.status}</div>
                </div>
                <ChannelBody channel={channel} body={o.body} />
              </article>
            );
          })}
      </section>
    </main>
  );
}

function ChannelBody({
  channel,
  body,
}: {
  channel: Channel;
  body: unknown;
}) {
  if (channel === "x_thread" && Array.isArray(body)) {
    return (
      <ol className="space-y-3">
        {(body as string[]).map((beat, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <span className="mono text-muted mr-2">{i + 1}.</span>
            {beat}
          </li>
        ))}
      </ol>
    );
  }
  if (channel === "reel_concept" && typeof body === "object" && body) {
    const r = body as {
      hook: string;
      beats: string[];
      voiceover: string;
      visual_direction: string;
    };
    return (
      <div className="space-y-4 text-sm">
        <div>
          <div className="cinematic mb-1">hook</div>
          <p>{r.hook}</p>
        </div>
        <div>
          <div className="cinematic mb-1">beats</div>
          <ol className="space-y-1">
            {r.beats.map((b, i) => (
              <li key={i}>
                <span className="mono text-muted mr-2">{i + 1}.</span>
                {b}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="cinematic mb-1">voiceover</div>
          <p className="leading-relaxed">{r.voiceover}</p>
        </div>
        <div>
          <div className="cinematic mb-1">visual direction</div>
          <p className="text-muted leading-relaxed">{r.visual_direction}</p>
        </div>
      </div>
    );
  }
  if (typeof body === "string") {
    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{body}</p>;
  }
  return (
    <pre className="mono text-xs text-muted whitespace-pre-wrap">
      {JSON.stringify(body, null, 2)}
    </pre>
  );
}
