# Urban Journey — Social Content Uploader

Upload a piece of content once. AI reads it, writes a platform-native caption and hashtags
for each connected platform, and schedules it to publish at that account's real peak
engagement hours — automatically, across Instagram, TikTok, YouTube Shorts, Facebook, X,
LinkedIn, Pinterest, and Threads.

## How it works

1. **Connect accounts** — OAuth into each platform from the dashboard (`/api/connect/:platform`).
2. **Upload** (`/api/upload`) — media is stored in Supabase Storage, then Gemini "reads" it
   (`lib/gemini.ts: analyzeContent`) to produce a summary, detected themes, tone, and a
   0-100 virality estimate.
3. **Generate captions** (`/api/generate-captions`) — Gemini writes a distinct, platform-native
   caption + hashtag set per platform (not a copy-paste rewrite). Optionally generates two
   differently-angled variants per platform for A/B testing.
4. **Schedule** (`/api/schedule`) — for each selected account, computes the next peak
   engagement slot (`lib/peakTimes.ts`, personalized per account once enough history exists),
   applies a rate-limit guardrail (`lib/rateLimitGuardrail.ts`) so posts to the same account
   are never bursted, and registers a QStash delayed job.
5. **Publish** (`/api/publish/:id`) — QStash calls this at the scheduled time; it publishes
   via the platform's own API (`lib/platforms/*`).
6. **Learn** (`/api/metrics/sync`, run on a schedule) — pulls engagement metrics for
   published posts, feeds them back into the peak-time engine, and resolves A/B test winners.

## Setup

1. `cp .env.example .env.local` and fill in every value — see comments in that file for
   where each key comes from (Supabase project settings, each platform's developer console,
   Google AI Studio for `GEMINI_API_KEY`, Upstash for QStash).
2. `npm install`
3. `npx prisma migrate dev --name init` (needs `DATABASE_URL` set)
4. Create a public Supabase Storage bucket named `content-uploads`.
5. `npm run dev`

## Registering developer apps (required before real posting works)

Every platform requires you to register a developer app and, in most cases, pass an app
review before your app can publish on behalf of users other than yourself in production:

- **Meta (Instagram, Facebook, Threads)**: developers.facebook.com — needs a Business
  verification and review for `instagram_content_publish` / `pages_manage_posts`.
- **TikTok**: developers.tiktok.com — Content Posting API requires an audit for direct
  (non-draft) publishing.
- **YouTube**: console.cloud.google.com — enable the YouTube Data API v3, and if you exceed
  the default quota or serve many external users you'll need a quota increase / OAuth
  verification.
- **X**: developer.x.com — posting requires a paid API tier (Basic or above).
- **LinkedIn**: developer.linkedin.com — `w_member_social` requires the Marketing
  Developer Platform product, which needs approval.
- **Pinterest**: developers.pinterest.com — standard app review.

Until an app is approved, you can still fully develop and test against your own connected
account (most platforms allow this in "development mode").

## Scheduling the metrics-sync loop

`/api/metrics/sync` is not called automatically — wire it to a scheduler (Vercel Cron,
QStash schedule, or the `create_trigger` tool if you're driving this from Claude) to hit it
roughly hourly with `Authorization: Bearer $CRON_SECRET`.

## Architecture notes

- OAuth access/refresh tokens are encrypted at rest with AES-256-GCM (`lib/crypto.ts`) —
  never stored in plaintext.
- The rate-limit guardrail enforces per-platform minimum spacing and daily caps so the
  scheduler can't accidentally get an account flagged for spam-like posting behavior.
- Peak posting times default to published platform averages and switch to real per-account
  historical data (`EngagementSample`) once 20+ samples have been collected via the
  metrics-sync loop.
