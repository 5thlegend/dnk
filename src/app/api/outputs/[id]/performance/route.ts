import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";

export const runtime = "edge";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const body = (await request.json()) as Record<string, number>;
  const sb = adminClient(supabaseUrl, serviceKey);
  const { error } = await sb
    .from("channel_outputs")
    .update({ performance: body, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
