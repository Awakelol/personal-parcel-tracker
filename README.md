# Parcel Tracker

A small dashboard for tracking parcels from Philippine couriers (SPX, J&T, Ninja Van,
Flash and anything else 17TRACK supports). It shows the scan history, a plain-English
summary from Gemini, an estimated arrival date and the route on a map, and lets you
save parcels to your account.

```text
worker/   Cloudflare Worker (Hono): API, auth, caching; also serves the built dashboard
web/      Vite + React + Tailwind dashboard
shared/   Types shared by both
```

## Running locally

Needs Node 20+.

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars    # add your Gemini and 17TRACK keys
npm run dev                       # http://localhost:8787
```

Locally you're logged in as `DEV_USER_EMAIL` from `.dev.vars`; Cloudflare Access is
only used in production. For UI work with hot reload, also run `npm run dev` in `web/`
(port 5173, proxies `/api` to the worker).

## Deploying

Pushes to `main` deploy through Workers Builds (root directory: `worker`). The web
app is built as part of `wrangler deploy`, and the KV namespaces are created on the
first deploy. Secrets live in the Worker's settings:

```sh
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SEVENTEENTRACK_API_KEY
```

### Login (Cloudflare Access)

The whole site sits behind Cloudflare Access with one-time email codes, and the
Worker verifies the Access token on every API call. To set it up:

1. Workers & Pages → the Worker → **Access** tab → *Protect this Worker behind Access*
   → *All traffic* → *Apply Access*.
2. Zero Trust → Access controls → Applications → the Worker's application → Policies:
   set the policy to *Allow*, include *Everyone*, with **One-time PIN** as the login method.
3. Copy the application's **Application Audience (AUD) Tag**, and your team domain from
   Zero Trust → Settings (`https://<team>.cloudflareaccess.com`), into `ACCESS_AUD` and
   `ACCESS_TEAM_DOMAIN` in `worker/wrangler.toml`.

The Worker checks the `Cf-Access-Jwt-Assertion` header itself (`ctx.access` isn't
passed to Workers that serve static assets).

Saved parcels are stored per account in KV, keyed by a hash of the email address.

## API

All routes except `/api/health` need a logged-in user.

| Route | |
| --- | --- |
| `POST /api/track` | `{ trackingNumber, courierCode? }` → `TrackResponse` |
| `GET /api/me` | current account |
| `GET /api/parcels` | saved parcels, with their latest cached result |
| `PUT /api/parcels/:number` | save or rename: `{ name, courierCode? }` |
| `DELETE /api/parcels/:number` | remove |

`courierCode` can be `spx-ph`, `jnt-ph`, `ninjavan-ph`, `flash-ph`, or any numeric
[17TRACK carrier id](https://res.17track.net/asset/carrier/info/apicarrier.all.json).
Without it, SPX numbers go straight to SPX and everything else is detected by 17TRACK.
Types are in [`shared/api.ts`](shared/api.ts).

## Notes

- **Tracking sources.** SPX's public tracking endpoint is undocumented and could
  change; if it fails, the worker falls back to 17TRACK. 17TRACK's free tier is a
  one-time 200 registrations (re-checking a registered number is free), 3 req/s,
  and its IP allow-list must stay empty.
- **Caching.** Results are cached for an hour per parcel, or 5 minutes when the
  summary failed or there are no scans yet.
- **Gemini.** `GEMINI_MODEL` falls back to `GEMINI_FALLBACK_MODEL` on timeouts,
  429s and 5xx errors. Arrival estimates come from the courier when 17TRACK has one,
  otherwise from Gemini.
- **Map.** The outline is Natural Earth data (public domain), pre-generated into
  `web/src/lib/phMap.ts` by `node web/scripts/build-ph-map.mjs`. Route stops come
  from Gemini, so positions are approximate.
