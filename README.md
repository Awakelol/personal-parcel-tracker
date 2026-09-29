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

```json
{ "trackingNumber": "9400111899223344556677", "courierCode": "usps" }
```

`courierCode` is optional (auto-detected). Responses are cached in KV for 1 hour
per tracking number; `cached: true` indicates a cache hit.
