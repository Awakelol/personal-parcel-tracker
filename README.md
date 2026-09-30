# Parcel Tracker

A small web dashboard for tracking parcels from Philippine couriers: SPX Express,
J&T Express, Ninja Van and Flash Express, plus anything else 17TRACK supports.
Paste a tracking number and it shows the scan history, a plain-English summary
written by Gemini, an estimated arrival date and the route on a map. Parcels can
be saved to an account and are re-checked each time you open the list.

It runs as a single Cloudflare Worker that serves both the API and the
dashboard, with Cloudflare Access handling login.

## Features

- **Courier lookups.** SPX numbers go straight to SPX's public tracking endpoint.
  Everything else goes through the 17TRACK API, with the courier detected
  automatically or chosen by hand.
- **Summary.** Gemini explains where the parcel is (facility, city and province),
  what the carrier jargon in the scans means, and the likely next steps.
- **Arrival estimate.** Gemini's estimate from the scan history, with the
  courier's own estimate shown underneath when 17TRACK reports one.
- **Route map.** The places named in the scans, plotted on an outline of the
  Philippines.
- **Saved parcels.** Name a parcel to keep it. The saved list follows your login
  across devices and flags parcels with scans you haven't seen yet.
- **Printable-label look.** Each result shows a scannable Code 128 barcode of the
  tracking number.

## Requirements

- Node.js 22 or newer
- A Cloudflare account (Workers, KV and Zero Trust free plans are enough)
- A [Gemini API key](https://aistudio.google.com/apikey)
- A [17TRACK API key](https://api.17track.net/en/doc) (free plan)

## Setup

```sh
git clone https://github.com/Awakelol/personal-parcel-tracker.git
cd personal-parcel-tracker/worker
npm install
cp .env.example .env    # then fill in the two API keys
npm run dev             # http://localhost:8787
```

`npm run dev` builds the dashboard in `web/` first, then serves it together with
the API. Locally you are logged in as `DEV_USER_EMAIL`, so Cloudflare Access is
not needed. KV data is stored under `worker/.wrangler/`.

For UI work with hot reload, also run the Vite dev server. It proxies `/api` to
the Worker on port 8787:

```sh
cd web
npm install
npm run dev             # http://localhost:5173
```

## Deploying

1. Deploy the Worker. Either run `npm run deploy` in `worker/`, or connect the
   repository to Workers Builds with `worker` as the root directory. The KV
   namespaces are created on the first deploy.
2. Add the API keys as secrets:

   ```sh
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put SEVENTEENTRACK_API_KEY
   ```

3. Put the Worker behind Cloudflare Access:
   1. Workers & Pages → the Worker → **Access** tab → *Protect this Worker
      behind Access* → *All traffic* → *Apply Access*.
   2. Zero Trust → Access controls → Applications → the Worker's application →
      Policies: allow the people who should have access, with **One-time PIN**
      as the login method. Including *Everyone* lets anyone with an email
      address create an account.
   3. Store the team domain (Zero Trust → Settings, `https://<team>.cloudflareaccess.com`)
      and the application's Audience (AUD) tag as secrets:

      ```sh
      npx wrangler secret put ACCESS_TEAM_DOMAIN
      npx wrangler secret put ACCESS_AUD
      ```

Until both Access settings are present, every API route except `/api/health`
returns 503.

## Configuration

Secrets are set with `wrangler secret put` in production and in `worker/.env`
locally. Plain settings live under `[vars]` in `worker/wrangler.toml` and can be
overridden in `worker/.env`. [`worker/.env.example`](worker/.env.example) lists
them all.

| Setting | Kind | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | secret | (required) | Gemini API key |
| `SEVENTEENTRACK_API_KEY` | secret | (required) | 17TRACK API key |
| `ACCESS_TEAM_DOMAIN` | secret | (required in production) | Cloudflare Access team domain |
| `ACCESS_AUD` | secret | (required in production) | Audience tag of the Access application |
| `DEV_USER_EMAIL` | local only | none | Log in as this user on `localhost` without Access |
| `GEMINI_MODEL` | var | `gemini-3.5-flash-lite` | Main model for summaries |
| `GEMINI_FALLBACK_MODEL` | var | `gemini-3.1-flash-lite` | Used when the main model times out or is overloaded |
| `TIMEZONE` | var | `Asia/Manila` | IANA timezone for "today" in arrival estimates |

## Usage

Open the site, log in through Access, and paste a tracking number. Leave the
courier on "Detect automatically" unless detection fails. The first lookup of a
new number can take a while as 17TRACK fetches it from the courier; the page
checks again on its own while the history is still loading.

Choose **Save parcel** to name and keep a parcel. The **Saved** tab re-checks
every saved parcel when opened and sorts parcels with new scans to the top.

Lookups are bookmarkable: `/?n=<tracking number>&c=<courier code>`.

### API

All routes except `/api/health` need a logged-in user. Request and response
types are in [`shared/api.ts`](shared/api.ts).

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/health` | | `{ status: "ok" }` |
| `GET /api/me` | | current account |
| `POST /api/track` | `{ trackingNumber, courierCode?, fresh?, deferAnalysis? }` | `TrackResponse` |
| `POST /api/track/analysis` | `{ trackingNumber, courierCode? }` | `TrackResponse` with the summary |
| `GET /api/parcels` | | saved parcels with their latest cached result |
| `PUT /api/parcels/:number` | `{ name, courierCode?, seenLatest? }` | the saved parcel |
| `POST /api/parcels/:number/seen` | `{ latest }` | 204 |
| `DELETE /api/parcels/:number` | | 204 |

`courierCode` is one of `spx-ph`, `jnt-ph`, `ninjavan-ph` and `flash-ph`, or any
numeric [17TRACK carrier id](https://res.17track.net/asset/carrier/info/apicarrier.all.json).
`fresh: true` skips the cache. `deferAnalysis: true` returns the scans
immediately with `analysisPending: true`; fetch the summary afterwards from
`/api/track/analysis`.

## How it works

```text
worker/   Cloudflare Worker (Hono): API, auth, caching; serves the built dashboard
web/      Vite + React + Tailwind dashboard
shared/   Types shared by both
```

- **Routing.** SPX numbers (`SPXPH…` or `PH` + 12 digits + a letter) go to SPX
  directly, falling back to 17TRACK if SPX errors or rate-limits. Flash numbers
  (`P` + 4 digits + 8 characters) go to 17TRACK's Flash carrier, because
  auto-detection often misses new ones. Everything else uses 17TRACK's
  detection or the chosen courier.
- **17TRACK quota.** Numbers are looked up with `gettrackinfo` first and only
  registered when 17TRACK doesn't know them yet, so re-checking a parcel costs
  no quota. After registering, the Worker polls for about nine seconds while
  17TRACK does its first fetch.
- **Privacy of upstream data.** Recipient names, addresses and reference fields
  are dropped before anything is sent to Gemini.
- **Summaries.** Gemini gets the scans and returns JSON that is checked against a
  schema. The main model gets one retry after a quick 429 or 5xx, then the
  fallback model is used. Each attempt has a 15 second limit. Route stops outside
  the Philippines and dates that have already passed are discarded.
- **Caching.** Lookups are cached in KV for an hour, or one minute if the summary
  failed. Parcels whose history is still loading upstream aren't cached.
  Summaries are stored for 30 days keyed by the exact scans, so Gemini only runs
  again when a parcel gets new scans.
- **Accounts.** The Worker verifies the Cloudflare Access JWT on every API
  request, even though Access already checks it at the edge, so the API stays
  closed if Access is switched off. Saved parcels are stored in KV under a
  SHA-256 hash of the user's email.
- **Map.** The outline is Natural Earth data (public domain), pre-generated into
  `web/src/lib/phMap.ts`. Regenerate it with `node web/scripts/build-ph-map.mjs`.

## Limitations

- Built for the Philippines. The courier list, the Gemini prompt, the map and the
  route filter all assume Philippine parcels. Other 17TRACK carriers still show a
  timeline, but the summary and map may not fit them.
- SPX's tracking endpoint is undocumented and could change without notice. The
  Worker falls back to 17TRACK when it fails.
- 17TRACK's free plan has a small one-time registration quota and a 3 requests
  per second limit, and its IP allow-list must stay empty because Workers don't
  have fixed IPs.
- Summaries, arrival estimates and map positions come from Gemini and can be
  wrong. Map positions are approximate.
- Each user's saved list is a single KV record. Two devices saving at the same
  moment can overwrite each other, and KV can take up to a minute to show a
  change in other locations.
- There are no automated tests.

## License

[MIT](LICENSE)
