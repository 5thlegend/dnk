import { NextResponse } from "next/server";
import { adminClient, updateOutputStatus } from "@/lib/supabase";
import { createTypefullyDraft, threadToTypefullyContent } from "@/lib/typefully";
import type { ChannelOutput } from "@/lib/types";

export const runtime = "edge";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as { scheduled_for?: string };

  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const sb = adminClient(supabaseUrl, serviceKey);

  const { data, error } = await sb
    .from("channel_outputs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) {
    return new NextResponse("output not found", { status: 404 });
  }
  const output = data as ChannelOutput;

  const typefullyKey = process.env.TYPEFULLY_API_KEY;
  let externalRef: string | undefined;

  if (typefullyKey && (output.channel === "x_post" || output.channel === "x_thread")) {
    const content =
      output.channel === "x_thread" && Array.isArray(output.body)
        ? threadToTypefullyContent(output.body as string[])
        : (output.body as string);
    try {
      const draft = await createTypefullyDraft({
        apiKey: typefullyKey,
        content,
        scheduledFor: body.scheduled_for,
        threadify: output.channel === "x_post",
      });
      externalRef = draft.id;
    } catch (e) {
      return new NextResponse(`typefully: ${(e as Error).message}`, { status: 502 });
    }
  }

  await updateOutputStatus(supabaseUrl, serviceKey, id, "scheduled", {
    scheduled_for: body.scheduled_for ?? null,
  });

  return NextResponse.json({ ok: true, external_ref: externalRef });
}
