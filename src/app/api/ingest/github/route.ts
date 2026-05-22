// GitHub webhook ingester.
// Auto-generates a transmission from push events with non-trivial commits.
//
// Setup: GitHub repo → Settings → Webhooks → Add webhook
//   Payload URL:    https://<your-deploy>/api/ingest/github
//   Content type:   application/json
//   Secret:         set GITHUB_WEBHOOK_SECRET to the same value
//   Events:         "Just the push event" (or also "Pull request" for merge ingest)

import { NextResponse } from "next/server";
import { generatePack } from "@/lib/llm";
import { insertTransmission } from "@/lib/supabase";
import { sendSingleTransmission } from "@/lib/email";

export const runtime = "edge";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function verifySignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // constant-time compare
  if (hex.length !== expected.length) return false;
  let ok = 0;
  for (let i = 0; i < hex.length; i++) ok |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return ok === 0;
}

type PushEvent = {
  ref: string;
  repository: { full_name: string; html_url: string };
  pusher: { name: string };
  commits: Array<{ id: string; message: string; url: string; author: { name: string } }>;
  head_commit: { id: string; message: string; url: string } | null;
};

function shouldIngestPush(payload: PushEvent): boolean {
  if (!payload.commits || payload.commits.length === 0) return false;
  // skip merge-only commits and pure-noise messages
  const meaningful = payload.commits.filter(
    (c) =>
      !c.message.toLowerCase().startsWith("merge ") &&
      !c.message.toLowerCase().startsWith("bump ") &&
      c.message.trim().length > 10,
  );
  return meaningful.length > 0;
}

function buildNoteFromPush(payload: PushEvent): string {
  const branch = payload.ref.replace("refs/heads/", "");
  const repo = payload.repository.full_name;
  const lines = [
    `pushed to ${repo} (${branch}) — ${payload.commits.length} commit(s)`,
    "",
  ];
  for (const c of payload.commits.slice(0, 10)) {
    lines.push(`- ${c.message.split("\n")[0]}`);
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 503 });

  const body = await request.text();
  const sig = request.headers.get("x-hub-signature-256");
  if (!(await verifySignature(body, sig, secret))) {
    return new NextResponse("bad signature", { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    return NextResponse.json({ pong: true });
  }
  if (event !== "push") {
    return NextResponse.json({ ignored: event });
  }

  const payload = JSON.parse(body) as PushEvent;
  if (!shouldIngestPush(payload)) {
    return NextResponse.json({ ignored: "no meaningful commits" });
  }

  const note = buildNoteFromPush(payload);

  const ai = (globalThis as unknown as { AI?: Ai }).AI;
  if (!ai && process.env.LLM_PROVIDER !== "anthropic") {
    return new NextResponse("AI binding missing and no anthropic fallback", { status: 503 });
  }

  const { pack, model } = await generatePack(
    { rawInput: note },
    {
      AI: ai!,
      LLM_PROVIDER: process.env.LLM_PROVIDER,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  );

  const { transmissionId } = await insertTransmission(
    envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
    envOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    {
      raw_input: note,
      ingest_summary: null,
      media_refs: [
        { type: "url", url: payload.head_commit?.url ?? payload.repository.html_url },
      ],
      source_user: `github:${payload.pusher.name}`,
      generation_model: model,
      pack,
    },
  );

  if (process.env.RESEND_API_KEY && process.env.DIGEST_TO_EMAIL) {
    const { listRecentDrafts } = await import("@/lib/supabase");
    const fresh = await listRecentDrafts(
      envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
      envOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
      1 / 60,
    );
    await sendSingleTransmission({
      apiKey: envOrThrow("RESEND_API_KEY"),
      from: process.env.DIGEST_FROM_EMAIL ?? "engine@generaldank.com",
      to: envOrThrow("DIGEST_TO_EMAIL"),
      outputs: fresh.filter((o) => o.transmission_id === transmissionId),
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
      cinematicLine: pack.cinematic_one_liner,
    });
  }

  return NextResponse.json({ ok: true, transmission_id: transmissionId });
}
