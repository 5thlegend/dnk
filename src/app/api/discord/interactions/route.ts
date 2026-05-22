import { NextResponse } from "next/server";
import {
  InteractionType,
  InteractionResponseType,
  verifyDiscordRequest,
  editOriginalResponse,
  getOptionValue,
  getAttachmentOption,
  getInteractionUserId,
  packToDiscordEmbeds,
  type DiscordInteraction,
} from "@/lib/discord";
import { ingestMedia, buildIngestSummary } from "@/lib/ingest";
import { generatePack } from "@/lib/llm";
import { insertTransmission } from "@/lib/supabase";
import { sendSingleTransmission } from "@/lib/email";
import type { MediaRef } from "@/lib/types";

export const runtime = "edge";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function handleDank(
  interaction: DiscordInteraction,
  ctx: { waitUntil: (p: Promise<unknown>) => void },
) {
  const note = getOptionValue(interaction, "note") ?? "";
  const url = getOptionValue(interaction, "url");
  const attachment = getAttachmentOption(interaction, "media");
  const userId = getInteractionUserId(interaction);

  const mediaRefs: MediaRef[] = [];
  if (attachment) {
    const ct = attachment.content_type ?? "";
    const type: MediaRef["type"] = ct.startsWith("image/")
      ? "image"
      : ct.startsWith("audio/")
      ? "audio"
      : ct.startsWith("video/")
      ? "video"
      : "file";
    mediaRefs.push({
      type,
      url: attachment.url,
      filename: attachment.filename,
      contentType: ct,
    });
  }
  if (url) {
    mediaRefs.push({ type: "url", url });
  }

  const work = (async () => {
    try {
      const ai = (globalThis as unknown as { AI?: Ai }).AI;
      const env = {
        AI: ai!,
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      };
      const enrichedRefs = await ingestMedia({ AI: ai! }, mediaRefs);
      const ingestSummary = buildIngestSummary(enrichedRefs);

      const { pack, model } = await generatePack(
        {
          rawInput: note,
          ingestSummary: ingestSummary || undefined,
        },
        env,
      );

      const { transmissionId } = await insertTransmission(
        envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
        envOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
        {
          raw_input: note,
          ingest_summary: ingestSummary || null,
          media_refs: enrichedRefs,
          source_user: userId,
          generation_model: model,
          pack,
        },
      );

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await editOriginalResponse(interaction.application_id, interaction.token, {
        embeds: packToDiscordEmbeds(pack, appUrl, transmissionId),
      });

      // fire-and-forget email
      if (process.env.RESEND_API_KEY && process.env.DIGEST_TO_EMAIL) {
        ctx.waitUntil(
          (async () => {
            const { listRecentDrafts } = await import("@/lib/supabase");
            const fresh = await listRecentDrafts(
              envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
              envOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
              1 / 60, // last minute — the one we just inserted
            );
            await sendSingleTransmission({
              apiKey: envOrThrow("RESEND_API_KEY"),
              from: process.env.DIGEST_FROM_EMAIL ?? "engine@generaldank.com",
              to: envOrThrow("DIGEST_TO_EMAIL"),
              outputs: fresh.filter((o) => o.transmission_id === transmissionId),
              appUrl,
              cinematicLine: pack.cinematic_one_liner,
            });
          })().catch((e) => console.error("email send failed", e)),
        );
      }
    } catch (e) {
      console.error("dank generation failed", e);
      await editOriginalResponse(interaction.application_id, interaction.token, {
        content: `**Engine error.**\n\`${(e as Error).message}\``,
      });
    }
  })();

  ctx.waitUntil(work);

  return NextResponse.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 0 },
  });
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return new NextResponse("missing DISCORD_PUBLIC_KEY", { status: 500 });
  }
  const verified = await verifyDiscordRequest(request, publicKey);
  if (!verified.ok) {
    return new NextResponse("bad signature", { status: 401 });
  }
  const interaction = JSON.parse(verified.body) as DiscordInteraction;

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const name = interaction.data?.name;
    if (name === "dank") {
      // Cloudflare Workers expose ctx via the request — but Next.js on Pages
      // does not surface it directly. Use the global fetch-style waitUntil
      // shim provided by @opennextjs/cloudflare.
      const ctx = {
        waitUntil(p: Promise<unknown>) {
          // best-effort: in dev this just runs inline
          p.catch((e) => console.error(e));
        },
      };
      // @ts-expect-error — Cloudflare runtime injects executionCtx on globalThis
      const cfCtx = globalThis.executionCtx ?? globalThis.context;
      if (cfCtx && typeof cfCtx.waitUntil === "function") {
        ctx.waitUntil = cfCtx.waitUntil.bind(cfCtx);
      }
      return handleDank(interaction, ctx);
    }
  }

  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: "Unknown interaction." },
  });
}
