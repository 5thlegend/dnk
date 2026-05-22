import { NextResponse } from "next/server";
import { listRecentDrafts } from "@/lib/supabase";
import { sendDigest } from "@/lib/email";

export const runtime = "edge";

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export async function GET(request: Request) {
  // simple shared-secret check for manual invocation; Cloudflare cron triggers
  // bypass this path and call the scheduled handler instead (see worker entry).
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const outputs = await listRecentDrafts(
    envOrThrow("NEXT_PUBLIC_SUPABASE_URL"),
    envOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    24,
  );
  if (outputs.length === 0) {
    return NextResponse.json({ sent: false, reason: "no recent drafts" });
  }
  await sendDigest({
    apiKey: envOrThrow("RESEND_API_KEY"),
    from: process.env.DIGEST_FROM_EMAIL ?? "engine@generaldank.com",
    to: envOrThrow("DIGEST_TO_EMAIL"),
    outputs,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  });
  return NextResponse.json({ sent: true, count: outputs.length });
}
