// Ingest pipeline — convert media attachments and URLs to text the model can reason over.
// Uses Cloudflare Workers AI for transcription + vision; native fetch for URLs.

import type { MediaRef } from "./types";

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const AUDIO_TYPES = new Set([
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/m4a",
  "audio/mp4",
]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

type IngestEnv = { AI: Ai };

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function transcribeAudio(env: IngestEnv, url: string): Promise<string> {
  const audio = await fetchBytes(url);
  const result = (await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
    audio: Array.from(audio),
  })) as { text?: string };
  return result.text?.trim() ?? "";
}

async function describeImage(env: IngestEnv, url: string): Promise<string> {
  const image = await fetchBytes(url);
  const result = (await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", {
    image: Array.from(image),
    prompt:
      "You are an ingest stage for a founder content engine. Describe what is in this image as if reporting raw signal to a system that will turn it into content. Be concrete and specific. 80-150 words.",
    max_tokens: 400,
  })) as { description?: string; response?: string };
  return (result.description ?? result.response ?? "").trim();
}

async function summarizeUrl(env: IngestEnv, url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "GeneralDankEngine/0.1" },
    });
    if (!res.ok) return `[url ${url} returned ${res.status}]`;
    const html = await res.text();
    // crude extraction — strip tags, collapse whitespace, cap length
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
    if (!text) return `[url ${url} returned no extractable text]`;
    // summarize via LLM
    const summary = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        {
          role: "system",
          content:
            "Summarize the following web page content as raw signal for a content engine. 100-180 words. Capture the core claim, who/what, and any notable framing or vocabulary.",
        },
        { role: "user", content: text },
      ],
      max_tokens: 400,
    })) as { response?: string };
    return (summary.response ?? "").trim();
  } catch (e) {
    return `[url ingest failed for ${url}: ${(e as Error).message}]`;
  }
}

export async function ingestMedia(
  env: IngestEnv,
  refs: MediaRef[],
): Promise<MediaRef[]> {
  const enriched: MediaRef[] = [];
  for (const ref of refs) {
    const ct = ref.contentType?.toLowerCase() ?? "";
    try {
      if (ref.type === "url") {
        const description = await summarizeUrl(env, ref.url);
        enriched.push({ ...ref, description });
      } else if (ref.type === "audio" || AUDIO_TYPES.has(ct)) {
        const transcript = await transcribeAudio(env, ref.url);
        enriched.push({ ...ref, type: "audio", transcript });
      } else if (ref.type === "image" || IMAGE_TYPES.has(ct)) {
        const description = await describeImage(env, ref.url);
        enriched.push({ ...ref, type: "image", description });
      } else if (ref.type === "video" || VIDEO_TYPES.has(ct)) {
        // Workers AI doesn't natively process video; flag for now and rely on caption
        enriched.push({
          ...ref,
          type: "video",
          description: "[video uploaded — frame analysis not yet implemented]",
        });
      } else {
        enriched.push(ref);
      }
    } catch (e) {
      enriched.push({
        ...ref,
        description: `[ingest error: ${(e as Error).message}]`,
      });
    }
  }
  return enriched;
}

export function buildIngestSummary(refs: MediaRef[]): string {
  const lines: string[] = [];
  refs.forEach((r, i) => {
    const prefix = `[${i + 1}] (${r.type}) ${r.filename ?? r.url}`;
    if (r.transcript) lines.push(`${prefix}\n  transcript: ${r.transcript}`);
    if (r.description) lines.push(`${prefix}\n  description: ${r.description}`);
  });
  return lines.join("\n\n");
}
