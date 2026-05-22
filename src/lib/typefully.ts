// Typefully — auto-schedule X posts and X threads from the dashboard.
// API docs: https://help.typefully.com/en/articles/8718287-typefully-api

type TypefullyDraft = {
  content: string;
  threadify?: boolean;
  share?: boolean;
  schedule_date?: string; // ISO 8601
  auto_retweet_enabled?: boolean;
  auto_plug_enabled?: boolean;
};

const TYPEFULLY_API = "https://api.typefully.com/v1";

export async function createTypefullyDraft(args: {
  apiKey: string;
  content: string;
  scheduledFor?: string;
  threadify?: boolean;
}): Promise<{ id: string; share_url?: string }> {
  const body: TypefullyDraft = {
    content: args.content,
    threadify: args.threadify ?? false,
    share: true,
  };
  if (args.scheduledFor) {
    body.schedule_date = args.scheduledFor;
  }
  const res = await fetch(`${TYPEFULLY_API}/drafts/`, {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`typefully ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as { id: string; share_url?: string };
}

export function threadToTypefullyContent(beats: string[]): string {
  // Typefully separates tweets in a thread with a blank line + 4 dashes + blank line
  return beats.join("\n\n----\n\n");
}
