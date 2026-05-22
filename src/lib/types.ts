import type { GeneratedPack, Channel } from "./prompts";

export type MediaRef = {
  type: "image" | "video" | "audio" | "url" | "file";
  url: string;
  filename?: string;
  contentType?: string;
  transcript?: string;
  description?: string;
};

export type TransmissionStatus = "draft" | "scheduled" | "posted" | "archived";
export type OutputStatus = "draft" | "edited" | "scheduled" | "posted" | "killed";

export type Transmission = {
  id: string;
  created_at: string;
  source: string;
  source_user: string | null;
  raw_input: string;
  ingest_summary: string | null;
  media_refs: MediaRef[];
  status: TransmissionStatus;
  tags: string[];
  generation_model: string | null;
  generation_cost_usd: number | null;
};

export type ChannelOutput = {
  id: string;
  transmission_id: string;
  channel: Channel;
  body: GeneratedPack[Channel];
  status: OutputStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  performance: Record<string, number> | null;
  created_at: string;
  updated_at: string;
};

export type TransmissionWithOutputs = Transmission & {
  outputs: ChannelOutput[];
};

export type Env = {
  AI: Ai;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  DIGEST_FROM_EMAIL: string;
  DIGEST_TO_EMAIL: string;
  LLM_PROVIDER: "cloudflare" | "anthropic";
  ANTHROPIC_API_KEY?: string;
};
