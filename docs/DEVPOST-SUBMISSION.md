# Devpost Submission — Taste Concierge (DRAFT, submit by Oct 31 2026 04:45 WAT)

## Project name
Taste Concierge — powered by Qloo

## Tagline
Tell it the artists and films you love. It plans your dinner, your night out and your next trip — from your taste, not from top-10 lists.

## Links (all five requirements)
- Live demo: https://qloo-taste-concierge.odemakindeezekiel5.workers.dev
- GitHub (public, MIT): https://github.com/nostoryworld/qloo-taste-concierge
- Licence: MIT (visible in repo)

## What it does
You enter the artists and films that define your taste, pick a city and a vibe,
and the concierge builds a ranked plan in three parts:

- **Dining** — restaurants whose cultural profile matches yours
- **Events & experiences** — live music, screenings and experiences adjacent to your taste
- **Trip ideas** — destinations and neighbourhoods people with your taste profile over-index on

Every recommendation carries a match score and a plain-English explanation
tied to the taste data: which artist or film drove it, and which shared
tags/mood connect them.

## Why it's Qloo-powered (the differentiator)
This app cannot work the same without Qloo — by design:

1. **Entity resolution against the taste graph.** Free-text favourites
   ("Burna Boy", "Black Panther") are resolved into Qloo entities across a
   graph of 250M+ entities spanning music, film/TV, dining, fashion and travel.
2. **Cross-domain affinity via the Insights API.** The concierge calls
   `GET /v2/insights` on `https://hackathon.api.qloo.com` (header
   `X-Api-Key`) to find what those taste entities predict in *other* domains —
   dining, places, destinations. A maps API knows what's near you; only the
   taste graph knows what people with *your* taste actually love.
3. **Explanations from taste data.** The "why" line on every pick is generated
   from the affinity signals (shared tags, mood, audience overlap), not
   marketing copy.

## How it's built
- Cloudflare Worker (free tier) serving the single-page front end and the
  JSON API from one deployment.
- `POST /api/concierge` → `src/qloo.js` resolves entities and queries the
  Qloo Insights API, then maps results into the dining/events/trips contract.
- Resilient demo design: if no API key is configured, a clearly-marked mock
  taste layer returns the same response shape, so the demo is always
  judge-testable end-to-end.

## Judging criteria notes
- **Technological Implementation:** deep Qloo usage — entity resolution +
  Insights API cross-domain affinity is the core engine, not a bolt-on.
- **Design:** complete product experience — one flow from taste input to a
  full ranked evening/trip plan with explanations, not a proof of concept.
- **Potential Impact:** every city guide, travel planner and concierge
  product recommends by popularity or proximity. Taste-first planning is a
  new default for how people decide where to eat, go and travel.
- **Quality of the Idea:** your taste in music and film already predicts
  your taste in food, places and cities — Taste Concierge makes that
  prediction usable in one click.

## TODO before submitting
- [ ] Confirm live demo shows `source: "qloo"` once the hackathon key is wired
- [ ] Confirm GitHub repo is public and README renders
- [ ] Devpost username / account check (same account used on the API key form)
