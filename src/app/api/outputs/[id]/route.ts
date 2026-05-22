import { NextResponse } from "next/server";
import { updateOutputStatus } from "@/lib/supabase";
import type { OutputStatus } from "@/lib/types";

export const runtime = "edge";

const ALLOWED: OutputStatus[] = ["draft", "edited", "scheduled", "posted", "killed"];

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const body = (await request.json()) as {
    status: OutputStatus;
    scheduled_for?: string;
    posted_at?: string;
    body?: unknown;
  };
  if (!ALLOWED.includes(body.status)) {
    return new NextResponse("bad status", { status: 400 });
  }
  await updateOutputStatus(url, key, id, body.status, {
    scheduled_for: body.scheduled_for ?? null,
    posted_at: body.posted_at ?? null,
    body: body.body as never,
  });
  return NextResponse.json({ ok: true });
}
