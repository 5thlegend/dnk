# GROWTH PLAYBOOK — 10k → 55k by EOY

The engine is the *production system*. This is the *distribution system*.
The engine doesn't grow followers. **Posting cadence, channel-fit, and
algorithmic surface area do.** Treat this doc as the operating manual.

---

## The math

- 7 months remaining
- Net needed: +45,000 followers
- ≈ +6,400/mo, ≈ +210/day, on aggregate
- Realistic distribution: 50% from Reels/Shorts, 30% from X (threads + viral posts),
  20% from LinkedIn + IG static + cross-pollination

This is not a "post more" problem. It is a **signal density** problem.

---

## Channel weights — where to spend energy

| Channel | Cadence | Why |
|---|---|---|
| **Instagram Reels** | 5/week | Single biggest algorithmic kingmaker for net-new audience. The cinematic/mythic voice IS the differentiator vs every other founder reel |
| **X posts** | 2/day | Compounds intra-day; threads compound across weeks |
| **X threads** | 2/week | Highest follow conversion when the hook lands |
| **LinkedIn posts** | 4/week | Reaches the operator/founder buyer segment your IG/X won't |
| **IG static / carousel** | 2/week | Carousels still convert best on saves; use for systems-thinking content |
| **TikTok (optional)** | reposts of Reels | Free distribution arbitrage, low effort |

---

## The 5-Loop Daily Operating Rhythm

The engine works only if you feed it. Run these loops every day:

### Loop 1 — Capture (every time something happens)
The moment something real happens — shipped, killed, learned, shifted — hit
`/dank` in Discord. Voice note works. Screenshot of a deploy works. The bar
is *something happened*, not *something is post-worthy*.

Target: **5–10 captures/day.** Most won't become hero posts. The engine
turns them into raw outputs you select from.

### Loop 2 — Curate (morning, 15 min)
Open the dashboard. Read overnight transmissions. Mark the strongest
outputs `scheduled`. Kill the rest. Don't edit perfectionistically — the
voice is the brand; minor edits won't compound.

### Loop 3 — Stage (midday, 30 min)
Move scheduled outputs into Typefully (X), Buffer (LI/IG), or your tool of
choice. For Reels: turn the reel_concept into a shot list and record in
batches of 3–5 per session.

### Loop 4 — Engage (evenings, 30 min)
Reply to comments and DMs. The algorithm rewards replies more than posts.
Use a transmission's `cta_opportunity` to seed real conversations — that's
where DMs and warm leads happen.

### Loop 5 — Review (Sundays, 45 min)
Open the dashboard, look at posted outputs from the last 7 days. Mark
performance manually (engagement %, follower delta). The dashboard surfaces
which channels and which voice notes converted. **Double down on what worked.**

---

## The Content Spine — every week looks like this

| Day | Hero asset | Support |
|---|---|---|
| Mon | LinkedIn long-form (operator-facing) | X morning + IG carousel |
| Tue | Reel #1 (system/build-in-public) | X thread |
| Wed | X thread (mythic teardown) | LinkedIn post |
| Thu | Reel #2 (founder transmission) | X morning |
| Fri | Reel #3 (cinematic one-liner over b-roll) | LinkedIn post |
| Sat | IG carousel (visual essay) | X post |
| Sun | Review + plan + Reel #4 record session | quiet |

**Never zero days.** Even on shipping days, one X post and one reel concept.

---

## The Pillar System — six themes the engine should hit on rotation

The General Dank voice needs to *feel* coherent across 7 months of posts.
Rotate through these six pillars so the audience builds a mental model of
the worldview, not just the operator:

1. **Building in realtime** — what shipped, what failed, what shifted
2. **Systems thinking** — frameworks, taxes, leverage points
3. **Cinematic operator** — moments of clarity, dispatches from the build
4. **Future infrastructure** — what comes after the current paradigm
5. **High-agency philosophy** — operator psychology, not motivation
6. **Civilization architecture** — the bigger thing being built

When you `/dank`, you can hint at the pillar in the note (e.g. "pillar:
systems"). Future versions of the engine can bias outputs by pillar.

---

## The Hook Library — what the engine should drift toward

The cinematic/mythic register lives or dies in the first 7 words. Train
yourself (and eventually the engine) on these hook shapes:

- "I just killed [X]." → the operator move
- "[X] is being built in realtime."
- "The expensive part of [X] is never [the obvious thing]."
- "Most founders [common move]. I [contrarian move]."
- "T+[duration]: [subsystem online]."
- "Everyone is optimizing [X]. The real game is [Y]."
- "[Mythic image] is what [mundane thing] actually is."
- "Three months ago I [past state]. Today I [present state]. The lesson:"

---

## Posting infrastructure — what to add later

Once daily rhythm is in place (week 2–3), layer these:

1. **Typefully / Hypefury integration** — auto-schedule X posts from the
   dashboard. Save 20 min/day.
2. **CapCut / Descript pipeline** — Reel concepts → script → record in
   batches → batch edit.
3. **Cross-post automation** — IG → TikTok auto-mirror via Buffer.
4. **Performance ingest** — daily cron pulls X analytics + IG insights →
   writes to `daily_metrics` table → dashboard surfaces what's working.
5. **Auto-ingest from GitHub** — commits and merged PRs become draft
   transmissions you approve.

---

## What kills growth (do not do)

- Posting in a different voice on each channel — the engine prevents this
- Editing the AI output until it sounds like everyone else's content — the
  cinematic register *is* the differentiation
- Going dark for 3+ days — algo penalties compound
- Replying late — engagement windows close in <2h on X, <12h on IG
- Building dashboard features instead of posting — the engine is done; the
  job now is daily ops

---

## The 30-day kickoff

**Week 1**: Set up engine. Capture 5×/day. Post 1×/day. No reels yet.
**Week 2**: Capture 5×/day. Post 2×/day on X. Record first 5 reels.
**Week 3**: Full weekly cadence (table above). Start replying to every comment.
**Week 4**: Review the 30 days. Find the 3 highest-performing post shapes.
Bias the engine prompt toward those (edit `prompts/general-dank.ts`).
