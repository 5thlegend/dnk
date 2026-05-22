import { Resend } from "resend";
import type { ChannelOutput } from "./types";
import { CHANNEL_LABELS, type Channel } from "./prompts";

function bodyToText(channel: Channel, body: unknown): string {
  if (channel === "x_thread" && Array.isArray(body)) {
    return body.map((b, i) => `${i + 1}. ${b}`).join("\n");
  }
  if (channel === "reel_concept" && typeof body === "object" && body) {
    const r = body as {
      hook?: string;
      beats?: string[];
      voiceover?: string;
      visual_direction?: string;
    };
    return [
      `HOOK: ${r.hook ?? ""}`,
      `BEATS:\n${(r.beats ?? []).map((b, i) => `  ${i + 1}. ${b}`).join("\n")}`,
      `VOICEOVER: ${r.voiceover ?? ""}`,
      `VISUAL: ${r.visual_direction ?? ""}`,
    ].join("\n");
  }
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function renderDigest(
  outputs: (ChannelOutput & { transmission_id: string })[],
  appUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `general dank · ${outputs.length} transmissions ready`;
  const grouped = new Map<string, ChannelOutput[]>();
  for (const o of outputs) {
    const arr = grouped.get(o.transmission_id) ?? [];
    arr.push(o);
    grouped.set(o.transmission_id, arr);
  }
  const text = Array.from(grouped.entries())
    .map(([txid, outs]) => {
      const lines = [
        `─────── transmission ${txid.slice(0, 8)} ───────`,
        `${appUrl}/transmission/${txid}`,
      ];
      for (const o of outs) {
        lines.push("");
        lines.push(`## ${CHANNEL_LABELS[o.channel as Channel]}`);
        lines.push(bodyToText(o.channel as Channel, o.body));
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const html = `<div style="font-family: ui-monospace, Menlo, monospace; max-width: 720px; margin: 0 auto; padding: 24px; color: #0a0a0a; background: #fafafa;">
    <h1 style="font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 24px;">General Dank · Daily Transmission</h1>
    <pre style="white-space: pre-wrap; font-size: 13px; line-height: 1.6;">${text.replace(/</g, "&lt;")}</pre>
    <p style="margin-top: 32px; font-size: 11px; color: #666;">open the dashboard: <a href="${appUrl}">${appUrl}</a></p>
  </div>`;
  return { subject, html, text };
}

export async function sendDigest(args: {
  apiKey: string;
  from: string;
  to: string;
  outputs: (ChannelOutput & { transmission_id: string })[];
  appUrl: string;
}) {
  if (args.outputs.length === 0) return;
  const { subject, html, text } = renderDigest(args.outputs, args.appUrl);
  const resend = new Resend(args.apiKey);
  await resend.emails.send({
    from: args.from,
    to: args.to,
    subject,
    html,
    text,
  });
}

export async function sendSingleTransmission(args: {
  apiKey: string;
  from: string;
  to: string;
  outputs: (ChannelOutput & { transmission_id: string })[];
  appUrl: string;
  cinematicLine?: string;
}) {
  if (args.outputs.length === 0) return;
  const { html, text } = renderDigest(args.outputs, args.appUrl);
  const resend = new Resend(args.apiKey);
  await resend.emails.send({
    from: args.from,
    to: args.to,
    subject: args.cinematicLine
      ? `general dank · ${args.cinematicLine.slice(0, 70)}`
      : "general dank · new transmission",
    html,
    text,
  });
}
