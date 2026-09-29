# Parcel Tracker

Personal multi-carrier parcel tracking dashboard.

| Path      | What                                                        |
| --------- | ----------------------------------------------------------- |
| `worker/` | Cloudflare Worker API (Hono) — TrackingMore + Gemini + KV   |
| `web/`    | Vite + React + Tailwind dashboard *(Phase 3)*               |
| `shared/` | TypeScript API contract imported by both                    |

## Worker setup

Requires Node.js 20+.

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars          # fill in your API keys
npm run dev                             # http://localhost:8787
```

Deploy:

```sh
npx wrangler kv namespace create TRACKING_CACHE   # paste id into wrangler.toml
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TRACKINGMORE_API_KEY
npm run deploy
```

## API

`POST /api/track`

```sh
curl -X POST http://localhost:8787/api/track \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"P1234ABCD5678","courierCode":"flashexpress-ph"}'
```

`courierCode` is an optional [TrackingMore courier code](https://www.trackingmore.com/couriers.html);
when omitted, the carrier is auto-detected. The response shape is `TrackResponse`
in [`shared/api.ts`](shared/api.ts): normalised status, a chronological event
timeline, and Gemini's `analysis` (summary, jargon, next steps).

Results are cached in KV for 1 hour per tracking number (`cached: true` on a hit).
Partial results — Gemini failed, or TrackingMore has no checkpoints yet — are
cached for 5 minutes instead.

### Configuration (`worker/wrangler.toml` `[vars]`)

| Var                     | Default                 | Purpose                                      |
| ----------------------- | ----------------------- | -------------------------------------------- |
| `ALLOWED_ORIGIN`        | `http://localhost:5173` | Comma-separated CORS origins                 |
| `GEMINI_MODEL`          | `gemini-3.8-flash`      | Primary analysis model                       |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | Used when the primary returns 429/5xx        |
