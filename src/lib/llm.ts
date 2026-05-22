// LLM client — Cloudflare Workers AI by default, swappable to Anthropic
// via LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY.

import {
  GENERAL_DANK_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  buildUserMessage,
  type GeneratedPack,
} from "./prompts";

type GenerateArgs = {
  rawInput: string;
  ingestSummary?: string;
  mediaContext?: string[];
};

function buildMessages(args: GenerateArgs) {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: GENERAL_DANK_SYSTEM_PROMPT },
  ];
  for (const ex of FEW_SHOT_EXAMPLES) {
    messages.push({
      role: "user",
      content: buildUserMessage({ rawInput: ex.input }),
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify(ex.output),
    });
  }
  messages.push({
    role: "user",
    content: buildUserMessage(args),
  });
  return messages;
}

function stripFences(text: string): string {
  // model sometimes wraps JSON in ```json ... ``` despite instructions
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function parsePack(text: string): GeneratedPack {
  const cleaned = stripFences(text);
  // try direct
  try {
    return JSON.parse(cleaned) as GeneratedPack;
  } catch {}
  // try first {...} match
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]) as GeneratedPack;
  }
  throw new Error(`Could not parse generated pack as JSON. Got: ${text.slice(0, 500)}`);
}

async function generateAnthropic(
  args: GenerateArgs,
  apiKey: string,
): Promise<{ pack: GeneratedPack; model: string }> {
  const messages = buildMessages(args);
  const system = messages.shift()!.content;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  return { pack: parsePack(text), model: "claude-opus-4-7" };
}

async function generateCloudflare(
  args: GenerateArgs,
  ai: Ai,
): Promise<{ pack: GeneratedPack; model: string }> {
  const messages = buildMessages(args);
  const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const result = (await ai.run(model, {
    messages,
    max_tokens: 4096,
    temperature: 0.85,
  })) as { response?: string };
  const text = result.response ?? "";
  return { pack: parsePack(text), model };
}

export async function generatePack(
  args: GenerateArgs,
  env: { LLM_PROVIDER?: string; ANTHROPIC_API_KEY?: string; AI: Ai },
): Promise<{ pack: GeneratedPack; model: string }> {
  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY missing");
    }
    return generateAnthropic(args, env.ANTHROPIC_API_KEY);
  }
  return generateCloudflare(args, env.AI);
}
