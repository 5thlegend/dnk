// Generic webhook ingester for Zapier / Make / IFTTT / Linear / Notion / curl.
//
// Auth: pass ?key=<INGEST_WEBHOOK_KEY> or header `x-ingest-key: <...>`
// Body: JSON: { note: string, url?: string, source?: string, media_url?: string }

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
  const expected = process.env.INGEST_WEBHOOK_KEY;
  if (!expected) return new NextResponse("not configured", { status: 503 });

  const provided =
    new URL(request.url).searchParams.get("key") ??
    request.headers.get("x-ingest-key");
  if (provided !== expected) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const body = (await request.json()) as {
    note?: string;
    url?: string;
    source?: string;
    media_url?: string;
    media_type?: "image" | "video" | "audio";
  };

  if (!body.note || body.note.trim().length === 0) {
    return new NextResponse("note required", { status: 400 });
  }

  const mediaRefs: MediaRef[] = [];
  if (body.media_url) {
    mediaRefs.push({
      type: body.media_type ?? "image",
      url: body.media_url,
    });
  }
  if (body.url) {
    mediaRefs.push({ type: "url", url: body.url });
  }

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
      source_user: body.source ?? "webhook",
      generation_model: model,
      pack,
    },
  );

  return NextResponse.json({ ok: true, transmission_id: transmissionId });
}
