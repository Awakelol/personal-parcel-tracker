# Parcel Tracker

Personal multi-carrier parcel tracking dashboard.

| Path      | What                                                        |
| --------- | ----------------------------------------------------------- |
| `worker/` | Cloudflare Worker API (Hono) — SPX/17TRACK + Gemini + KV    |
| `web/`    | Vite + React + Tailwind dashboard, served by the Worker     |
| `shared/` | TypeScript API contract imported by both                    |

One Worker serves everything: `/api/*` runs the API, every other path serves the
dashboard built from `web/` (wrangler builds it automatically before `dev` and
`deploy`, via `[build]` in `wrangler.toml`).

## Local development

Requires Node.js 20+.

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars          # fill in your API keys
npm run dev                             # dashboard + API on http://localhost:8787
```

For hot-reloading UI work, keep the Worker running and start Vite alongside it:

```sh
cd web
npm run dev                             # http://localhost:5173, proxies /api to :8787
```

## Deploy

Pushes to `main` deploy automatically via Workers Builds (root directory `worker`).
The `TRACKING_CACHE` KV namespace is provisioned on first deploy. To deploy by hand:

```sh
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SEVENTEENTRACK_API_KEY
npm run deploy
```

## API

`POST /api/track`

```sh
curl -X POST http://localhost:8787/api/track \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"P1234ABCD5678","courierCode":"flash-ph"}'
```

`courierCode` is optional: `spx-ph`, `jnt-ph`, `ninjavan-ph`, `flash-ph`, or any
numeric [17TRACK carrier ID](https://res.17track.net/asset/carrier/info/apicarrier.all.json).
When omitted, `SPXPH…` numbers go to SPX and everything else is auto-detected by
17TRACK. The response shape is `TrackResponse` in [`shared/api.ts`](shared/api.ts):
normalised status, a chronological event timeline, and Gemini's `analysis`
(summary, jargon, next steps).

### Tracking sources (free)

| Source | Used for | Limits |
| ------ | -------- | ------ |
| SPX public endpoint | SPX Express PH | Undocumented; may change or block. Falls back to 17TRACK on errors. |
| [17TRACK API](https://api.17track.net/en/doc) | Everything else | One-time 200 registrations; re-checking a registered number is free. 3 req/s. Keep the IP allow-list empty. |

Results are cached in KV for 1 hour per tracking number (`cached: true` on a hit).
Partial results — Gemini failed, or the carrier has no events yet — are cached
for 5 minutes instead.

### Configuration (`worker/wrangler.toml` `[vars]`)

| Var                     | Default                 | Purpose                                      |
| ----------------------- | ----------------------- | -------------------------------------------- |
| `ALLOWED_ORIGIN`        | `http://localhost:5173` | Comma-separated CORS origins                 |
| `GEMINI_MODEL`          | `gemini-3.5-flash`      | Primary analysis model                       |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | Used when the primary returns 429/5xx        |
