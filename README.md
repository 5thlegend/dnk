# GENERAL DANK CONTENT ENGINE™

Transform real-world founder activity into cinematic omnipresence content.

A Discord-first, Cloudflare-native content engine. You dump raw founder
signal in (text, voice notes, images, video, URLs), and the engine returns
a 10-output content pack tuned for X, IG, LinkedIn, and Reels in the
General Dank voice.

```
capture                              ingest               generate
─────────                            ─────────            ──────────
Discord /dank ──┐                   whisper (audio)        Llama 3.3 70B
web /capture ───┼──► founder blob ──► vision (image) ──► or Opus 4.7
GitHub push ────┤                   url fetch + parse      ─────────
generic webhook ┘                                                │
                                                                 ▼
                                                            10-output pack
                                                                 │
              ┌──────────────────┬────────────────────┬──────────┘
              ▼                  ▼                    ▼
      Supabase store     Discord embed reply    daily email digest
              │
              ▼
      Next.js kanban dashboard
        draft → scheduled → posted
        Typefully push for X
        manual performance logging
```

## Mission

Real-world founder activity → cinematic omnipresence content. Cinematic,
mythic, intelligent, founder-worldbuilder, blacksite futurism, Apple
precision, Kojima atmosphere, Sakurai clarity, Arc Browser energy, anime
protagonist pacing.

Never generic guru. Never cringe hustle. Should feel like *"the future is
being built in realtime."*

## Outputs per transmission

1. X post
2. X thread
3. IG caption
4. Reel concept
5. Founder transmission
6. Deployment log
7. LinkedIn positioning post
8. Cinematic one-liner
9. Team-in-bio update
10. CTA opportunity

## Stack

| Layer | Service |
|---|---|
| Dashboard + API | Next.js 15 on Cloudflare Pages |
| Discord bot | Cloudflare Workers (Interactions endpoint) |
| LLM | Cloudflare Workers AI (Llama 3.3 70B) — `LLM_PROVIDER=anthropic` swaps to Opus 4.7 |
| Transcription | Workers AI Whisper |
| Vision | Workers AI Llama 3.2 Vision |
| DB | Supabase Postgres |
| Media storage | Supabase Storage |
| Email | Resend |
| X auto-post | Typefully (optional) |
| Auto-ingest | GitHub webhook + generic webhook (Zapier/Linear/Notion/IFTTT) |

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and fill:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DISCORD_PUBLIC_KEY=
DISCORD_APPLICATION_ID=
DISCORD_BOT_TOKEN=
RESEND_API_KEY=
DIGEST_TO_EMAIL=
LLM_PROVIDER=cloudflare           # or "anthropic"
ANTHROPIC_API_KEY=                # only if LLM_PROVIDER=anthropic
```

For local Cloudflare dev, mirror these into `.dev.vars`.

### 3. Supabase

Run `supabase/schema.sql` in the SQL editor.

### 4. Discord app

- Create application at https://discord.com/developers/applications
- Copy public key + app ID into env
- Register the `/dank` slash command (see `scripts/register-commands.ts`)
- Set Interactions Endpoint URL to `https://<your-deploy>/api/discord/interactions`

### 5. Cloudflare

- Bind `AI` (Workers AI), `R2` optional, set the env vars as secrets
- Deploy with `pnpm run deploy`

### 6. Cron (daily digest)

A Cloudflare Cron Trigger fires `/api/cron/digest` at 8am local time.
Configure in `wrangler.jsonc`.

## Growth model

10k → 55k by EOY assumes:

- 1+ transmissions/day captured via Discord
- Daily X post, 2–3 Reels/week, 1 thread/week, 3 LinkedIn/week
- Dashboard kanban tracks status per channel per transmission
- Daily email digest surfaces what's queued and what shipped

## Voice swap

If Llama drifts off-voice, set `LLM_PROVIDER=anthropic` and add
`ANTHROPIC_API_KEY`. The prompt scaffolding is the same — Opus 4.7 hits
the cinematic register more reliably at higher cost.
