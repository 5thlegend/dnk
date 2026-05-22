import { createClient } from "@supabase/supabase-js";
import type { ChannelOutput, Transmission, TransmissionWithOutputs, MediaRef } from "./types";
import { CHANNELS } from "./prompts";
import type { GeneratedPack } from "./prompts";

export function adminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function insertTransmission(
  url: string,
  serviceRoleKey: string,
  args: {
    raw_input: string;
    ingest_summary: string | null;
    media_refs: MediaRef[];
    source_user: string | null;
    generation_model: string;
    pack: GeneratedPack;
  },
): Promise<{ transmissionId: string }> {
  const sb = adminClient(url, serviceRoleKey);
  const { data: tx, error: txErr } = await sb
    .from("transmissions")
    .insert({
      raw_input: args.raw_input,
      ingest_summary: args.ingest_summary,
      media_refs: args.media_refs,
      source_user: args.source_user,
      generation_model: args.generation_model,
    })
    .select("id")
    .single();
  if (txErr || !tx) throw new Error(`insert transmission: ${txErr?.message}`);

  const rows = CHANNELS.map((channel) => ({
    transmission_id: tx.id,
    channel,
    body: args.pack[channel] as unknown,
  }));
  const { error: outErr } = await sb.from("channel_outputs").insert(rows);
  if (outErr) throw new Error(`insert outputs: ${outErr.message}`);

  return { transmissionId: tx.id as string };
}

export async function listTransmissions(
  url: string,
  serviceRoleKey: string,
  limit = 50,
): Promise<TransmissionWithOutputs[]> {
  const sb = adminClient(url, serviceRoleKey);
  const { data, error } = await sb
    .from("transmissions")
    .select("*, outputs:channel_outputs(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TransmissionWithOutputs[];
}

export async function getTransmission(
  url: string,
  serviceRoleKey: string,
  id: string,
): Promise<TransmissionWithOutputs | null> {
  const sb = adminClient(url, serviceRoleKey);
  const { data, error } = await sb
    .from("transmissions")
    .select("*, outputs:channel_outputs(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as TransmissionWithOutputs) ?? null;
}

export async function updateOutputStatus(
  url: string,
  serviceRoleKey: string,
  outputId: string,
  status: ChannelOutput["status"],
  patch?: Partial<Pick<ChannelOutput, "scheduled_for" | "posted_at" | "body">>,
) {
  const sb = adminClient(url, serviceRoleKey);
  const { error } = await sb
    .from("channel_outputs")
    .update({ status, updated_at: new Date().toISOString(), ...patch })
    .eq("id", outputId);
  if (error) throw new Error(error.message);
}

export async function listScheduledForToday(
  url: string,
  serviceRoleKey: string,
): Promise<ChannelOutput[]> {
  const sb = adminClient(url, serviceRoleKey);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const { data, error } = await sb
    .from("channel_outputs")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_for", start.toISOString())
    .lt("scheduled_for", end.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []) as ChannelOutput[];
}

export async function listRecentDrafts(
  url: string,
  serviceRoleKey: string,
  hours = 24,
): Promise<(ChannelOutput & { transmission_id: string })[]> {
  const sb = adminClient(url, serviceRoleKey);
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from("channel_outputs")
    .select("*")
    .eq("status", "draft")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as (ChannelOutput & { transmission_id: string })[];
}
