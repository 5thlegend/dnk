# SETUP — General Dank Content Engine

Step-by-step. Each section is independent — skip what you've already done.

## 1. Supabase (5 min)

1. supabase.com → new project (free tier)
2. Settings → API → copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. SQL editor → paste `supabase/schema.sql` → run

## 2. Discord application (5 min)

1. discord.com/developers/applications → New Application → name it "General Dank"
2. General Information → copy `Application ID` → `DISCORD_APPLICATION_ID`
3. General Information → copy `Public Key` → `DISCORD_PUBLIC_KEY`
4. Bot tab → Reset Token → copy → `DISCORD_BOT_TOKEN`
5. Bot tab → Privileged Gateway Intents: leave all OFF (slash commands only)
6. OAuth2 → URL Generator:
   - Scopes: `applications.commands` + `bot`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Attach Files`
7. Open the generated URL → add the bot to your private server

## 3. Resend (2 min)

1. resend.com → sign up → create API key → `RESEND_API_KEY`
2. Add and verify your sending domain (or use `onboarding@resend.dev` for testing)
3. Set `DIGEST_FROM_EMAIL` and `DIGEST_TO_EMAIL`

## 4. Local dev

```bash
cp .env.example .env.local
# fill in all values, then:
pnpm install
pnpm dev
```

Visit http://localhost:3000 — empty dashboard.

## 5. Cloudflare Pages deploy

```bash
# one-time auth
npx wrangler login

# bind Workers AI in the Cloudflare dashboard:
#   Pages → your project → Settings → Functions → AI bindings → add "AI"

# set secrets (not vars):
npx wrangler pages secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler pages secret put DISCORD_PUBLIC_KEY
npx wrangler pages secret put DISCORD_APPLICATION_ID
npx wrangler pages secret put DISCORD_BOT_TOKEN
npx wrangler pages secret put RESEND_API_KEY
npx wrangler pages secret put DIGEST_FROM_EMAIL
npx wrangler pages secret put DIGEST_TO_EMAIL

# deploy:
pnpm run deploy
```

Note your deployed URL (e.g. `https://general-dank-engine.pages.dev`).

## 6. Register the Discord slash command

```bash
pnpm run register-commands
```

## 7. Point Discord at your endpoint

1. discord.com/developers/applications → your app → General Information
2. `Interactions Endpoint URL`: `https://<your-pages-url>/api/discord/interactions`
3. Save. Discord will PING the endpoint — must respond within 3s or it fails.

## 8. Test

In your Discord server, type:

```
/dank note: shipped the v2 ingest pipeline today
```

Within ~30s, the bot edits its reply with an embed containing the 10-output
pack. Open the dashboard URL — the transmission appears in the kanban.

## 9. Voice swap (optional)

If Llama 3.3's output isn't hitting the cinematic register:

```bash
npx wrangler pages secret put ANTHROPIC_API_KEY   # paste your key
npx wrangler pages secret put LLM_PROVIDER        # value: anthropic
```

Re-deploy. Subsequent transmissions use Opus 4.7.

## Troubleshooting

- **Discord PING fails on endpoint save**: the route returns within 3s but verify
  `DISCORD_PUBLIC_KEY` is exactly the hex string from Discord, no prefix.
- **`/dank` returns "engine error"**: check the Pages function logs in the
  Cloudflare dashboard.
- **No email arriving**: Resend will silently drop sends until domain is verified
  — check the Resend dashboard logs.
- **Vision/Whisper failing**: confirm the AI binding is attached to the Pages
  project (Settings → Functions → AI bindings).
