// Internal capture endpoint used by the in-app /capture form.
// Same shape as /api/ingest/webhook but auth via same-origin cookie / no auth
// in single-user mode.

import { NextResponse } from "next/server";
import { generatePack } from "@/lib/llm";
import { insertTransmission } from "@/lib/supabase";
import { ingestMedia, buildIngestSummary } from "@/lib/ingest";
import type { MediaRef } from "@/lib/types";

export const runtime = "edge";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export async function POST(request: Request) {
  let body: { note?: string; url?: string };
  try {
    body = (await request.json()) as { note?: string; url?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.note || body.note.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "note required" }, { status: 400 });
  }

  try {
    const mediaRefs: MediaRef[] = [];
    if (body.url) mediaRefs.push({ type: "url", url: body.url });

    const ai = (globalThis as unknown as { AI?: Ai }).AI;
    const enriched = ai
      ? await ingestMedia({ AI: ai }, mediaRefs)
      : mediaRefs;
    const ingestSummary = buildIngestSummary(enriched);

    const { pack, model } = await generatePack(
      {
        rawInput: body.note,
        ingestSummary: ingestSummary || undefined,
      },
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
        raw_input: body.note,
        ingest_summary: ingestSummary || null,
        media_refs: enriched,
        source_user: "web",
        generation_model: model,
        pack,
      },
    );

    return NextResponse.json({
      ok: true,
      transmission_id: transmissionId,
      cinematic_one_liner: pack.cinematic_one_liner,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
