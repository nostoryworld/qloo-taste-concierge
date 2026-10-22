# Taste Concierge — powered by Qloo

Tell the concierge the **artists and films you love**, and it plans your
**dining, events and trips** — matched to your actual taste profile, not
generic top-10 lists.

Built for the **Qloo Agentic Hackathon** on Devpost.

## Why it's Qloo-powered

Remove Qloo and this app stops working as designed. The whole flow is:

1. **Taste inputs** — favourite artists + films (free text).
2. **Qloo Insights API** — those inputs are resolved against Qloo's taste
   graph (250M+ entities across music, film/TV, dining, fashion and travel)
   to build a taste profile and pull culturally-adjacent recommendations.
3. **Ranked plan** — Dining, Events/Experiences and Trip ideas, each with a
   match score and a *"why this matches your taste"* explanation tied back
   to the taste data (which artist/film, which shared tags/mood).

A generic places API can tell you what's near you or what's popular.
Only the taste graph can tell you that fans of *this* artist over-index on
*that* kind of restaurant, screening or destination.

## Qloo API — confirmed hackathon details

These are exact; getting any of them wrong breaks the integration:

| Detail | Value |
|---|---|
| Base URL (`QLOO_API_BASE`) | `https://hackathon.api.qloo.com` — **must** be this host. Other Qloo base URLs return **401** with hackathon keys. |
| Auth | Header **`X-Api-Key: <key>`** only — not `Authorization: Bearer`, not a query param. |
| Primary endpoint | **`GET /v2/insights`** — the Qloo **Insights API**. It is GET-only: parameters go in the query string; POSTing a JSON body fails. |
| Entity resolution | **`GET /search?query=<name>&types=urn:entity:artist`** (or `urn:entity:movie`) — one call per taste input; the top match's entity UUID becomes a seed. |
| Recommendations | `GET /v2/insights?filter.type=<type>&signal.interests.entities=<seed UUIDs>&feature.explainability=true&take=5` — Dining: `filter.type=urn:entity:place` + `filter.location.query=<city>`. Events: venues, also `urn:entity:place` (Qloo has **no** event entity type; dining picks are excluded via `filter.exclude.entities`). Trips: `filter.type=urn:entity:destination` (the entity signal is required for destinations). |
| Explanations | Each result's `query.explainability` says which seed entities drove it (0–1 scores); the app joins those IDs back to seed names and adds shared `tags[]` names to build every *"why this matches your taste"* line. |
| Legacy endpoints | Do **not** use legacy `/recommendations` or `/recs` endpoints anywhere. |

Code lives in [`src/qloo.js`](src/qloo.js): `INSIGHTS_PATH = "/v2/insights"`,
`SEARCH_PATH = "/search"`, `DEFAULT_BASE = "https://hackathon.api.qloo.com"`,
and the only auth header sent is `X-Api-Key`.

### Demo resilience (mock fallback)

If `QLOO_API_KEY` is not set — or the live call fails for any reason — the
app falls back to a clearly-marked mock taste layer in `src/qloo.js`
(`source: "mock"` in the API response, vs `source: "qloo"` live). Judges
always get a working end-to-end demo; the mock returns the same response
shape the real Insights mapping produces, so wiring a key in is the only
change needed.

## Run it

Prerequisites: Node.js 18+ and [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
# 1. Local dev (no key needed — mock fallback)
npx wrangler dev
# → http://localhost:8787

# 2. Local dev with a real Qloo key
cp .dev.vars.example .dev.vars   # then paste your key into .dev.vars
npx wrangler dev

# 3. Deploy (Cloudflare Workers, free tier)
npx wrangler secret put QLOO_API_KEY   # paste your hackathon key when prompted
npx wrangler deploy
```

### Environment variables

| Name | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | For live data | Secret. Get one from Qloo's developer signup for the hackathon. Never commit it — use `.dev.vars` locally (gitignored) and `wrangler secret put` in production. |
| `QLOO_API_BASE` | No | Defaults to `https://hackathon.api.qloo.com`. Leave at the default for hackathon keys (see table above). |

## API

### `POST /api/concierge`

```json
{ "artists": ["Burna Boy", "Tems"], "films": ["Black Panther"], "city": "Lagos", "vibe": "Big night out" }
```

Returns `{ entities, profile, source, dining[], events[], trips[] }` — each
recommendation has `name`, `category`, `score` (0–1), `why`, `area`,
`priceHint`.

### `GET /api/health`

Returns `{ ok, qloo_base, qloo_endpoint, qloo_method, qloo_search_endpoint, qloo_key_configured }` — handy to
verify a deployment is pointed at the hackathon base URL.

## Project structure

```
wrangler.toml      # name: qloo-taste-concierge, workers_dev = true
src/index.js       # Worker: single-page front end + /api routes
src/qloo.js        # Qloo data layer: GET /search + GET /v2/insights client + mock fallback
LICENSE            # MIT
.dev.vars.example  # copy to .dev.vars for local secrets
```

## Licence

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Ezekiel Odemakinde.
