// Discord helpers — Ed25519 signature verification + interaction response helpers.

import { verifyKey } from "discord-interactions";
import type { GeneratedPack } from "./prompts";

export async function verifyDiscordRequest(
  request: Request,
  publicKey: string,
): Promise<{ ok: true; body: string } | { ok: false }> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return { ok: false };
  const body = await request.text();
  const isValid = await verifyKey(body, signature, timestamp, publicKey);
  if (!isValid) return { ok: false };
  return { ok: true, body };
}

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

export type DiscordAttachment = {
  id: string;
  filename: string;
  url: string;
  proxy_url: string;
  content_type?: string;
  size: number;
};

export type DiscordInteraction = {
  id: string;
  application_id: string;
  type: number;
  token: string;
  data?: {
    name?: string;
    options?: Array<{ name: string; type: number; value: string | number | boolean }>;
    resolved?: {
      attachments?: Record<string, DiscordAttachment>;
    };
  };
  member?: { user: { id: string; username: string } };
  user?: { id: string; username: string };
};

export function getOptionValue(
  interaction: DiscordInteraction,
  name: string,
): string | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  if (!opt) return undefined;
  if (typeof opt.value === "string") return opt.value;
  return undefined;
}

export function getAttachmentOption(
  interaction: DiscordInteraction,
  name: string,
): DiscordAttachment | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  if (!opt || typeof opt.value !== "string") return undefined;
  return interaction.data?.resolved?.attachments?.[opt.value];
}

export function getInteractionUserId(interaction: DiscordInteraction): string | null {
  return interaction.member?.user.id ?? interaction.user?.id ?? null;
}

const DISCORD_API = "https://discord.com/api/v10";

export async function editOriginalResponse(
  applicationId: string,
  token: string,
  payload: unknown,
): Promise<void> {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    console.error("discord edit failed", res.status, await res.text());
  }
}

export function packToDiscordEmbeds(
  pack: GeneratedPack,
  appUrl: string,
  transmissionId: string,
) {
  const trunc = (s: string, n = 1020) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;
  const threadStr = pack.x_thread
    .map((b, i) => `${i + 1}. ${b}`)
    .join("\n");
  return [
    {
      title: "TRANSMISSION RECEIVED",
      description: pack.cinematic_one_liner,
      color: 0x000000,
      url: `${appUrl}/transmission/${transmissionId}`,
      fields: [
        { name: "X Post", value: trunc(pack.x_post) },
        { name: "X Thread", value: trunc(threadStr) },
        { name: "IG Caption", value: trunc(pack.ig_caption) },
        {
          name: "Reel — Hook",
          value: trunc(pack.reel_concept.hook),
        },
        {
          name: "Reel — Voiceover",
          value: trunc(pack.reel_concept.voiceover),
        },
        { name: "Founder Transmission", value: trunc(pack.founder_transmission) },
        { name: "Deployment Log", value: trunc(pack.deployment_log) },
        { name: "LinkedIn", value: trunc(pack.linkedin_post) },
        { name: "Team-in-Bio", value: trunc(pack.team_in_bio) },
        { name: "CTA Opportunity", value: trunc(pack.cta_opportunity) },
      ],
      footer: { text: `general dank · ${transmissionId.slice(0, 8)}` },
    },
  ];
}
