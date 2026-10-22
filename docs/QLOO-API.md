# Qloo API — Research Notes for the Taste Concierge Build

Researched 2026-10-22 from Qloo's official documentation at https://docs.qloo.com
(primary source: the hackathon developer guide), the official Devpost rules for the
Qloo Agentic Hackathon (https://qloo.devpost.com/rules), and worked examples in the
official docs. Endpoint paths, parameter names and examples below are copied from
those docs — do not invent variants; unsupported parameters are *silently ignored*
(see pitfalls).

---

## ⚠️ HACKATHON CONSTRAINTS — READ FIRST

Source: **Qloo Agentic Hackathon Developer Guide**
https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
(updated 2026-10-07 in the docs system). This guide overrides every generic
example elsewhere in the Qloo docs.

1. **Hackathon base URL ONLY:**
   ```
   https://hackathon.api.qloo.com
   ```
   Hackathon keys **do not work** against staging or production:
   - `https://staging.api.qloo.com` → **401**
   - `https://api.qloo.com` → **401**

   > "Using the wrong base URL is the most common cause of 401 errors."
   > If you copy a curl example from the general docs (most show `staging.api.qloo.com`
   > or `api.qloo.com`), replace the base URL before running it.

2. **Auth is the `X-Api-Key` header — nothing else.**
   ```bash
   curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:movie"
   ```
   - Do **NOT** send `Authorization: Bearer <key>` → `401 "No API key found in request"`.
   - Do **NOT** pass the key as a query parameter.

3. **Primary endpoint is the Insights API: `GET /v2/insights`.**
   - It is a **GET** request. Parameters go in the **query string**, not a JSON body.
     Sending `POST /v2/insights` with a JSON body fails with
     *"No path matching request parameters"* / unexpected 404 (per hackathon guide).
   - Every Insights request **must** include `filter.type`.
   - `/search` and `/v2/insights` are separate endpoints — `/v2/insights/search`
     is **not** a valid path (404).

4. **Do NOT use legacy endpoints:**
   - ❌ `/recommendations`
   - ❌ `/recs`

   Both are legacy and **not supported for the hackathon**.

5. **Only documented parameters work.** Custom / unsupported / deprecated parameters
   will not work; invalid parameters for the chosen `filter.type` are **silently
   ignored rather than returning an error**. Symptom: `200` with an empty
   `entities` array and no error. Fix: verify every parameter against the
   Entity Type Parameter Guide for your `filter.type` (see §5).

6. **Supported `filter.type` values for hackathon Insights (exact list from the guide):**
   ```
   urn:entity:artist        urn:entity:book          urn:entity:brand
   urn:entity:destination   urn:entity:movie         urn:entity:person
   urn:entity:place         urn:entity:podcast       urn:entity:tv_show
   urn:entity:video_game
   ```
   Common mistakes (→ `403 "You do not have permission to access urn:entity:..."`):
   - Music: use `urn:entity:artist`, **not** `urn:entity:music`
   - Food / drink: use `urn:entity:place` or `urn:entity:brand`, **not** `urn:entity:food_and_drink`
   - Also in the wider docs: `urn:entity:tag` (Taste Analysis, `filter.type=urn:tag`
     in the Parameter Guide) and `urn:entity:heatmap` exist — but they are **not** in
     the hackathon guide's supported list, so treat them as at-risk and test early.
   - Deprecated, do not use for new builds: `urn:entity:audience` as a `filter.type`,
     and `urn:entity:actor` / `urn:entity:author` / `urn:entity:director`
     (use `urn:entity:person` instead). Note `/search` *does* still accept some of
     these as legacy `types` values (see §4.1) — search types ≠ Insights types.

7. **Rate / quota:** "Hackathon API keys have rate and monthly quota limits set high
   enough to support typical hackathon projects." No numeric limit is published.
   If you hit the monthly limit, post in **#api-help** in the Qloo Hackathon Discord
   (linked from the guide) — limits can be raised per-user. Keys stay active through
   the end of the judging period and are deactivated after the hackathon closes.

8. **Caching:** Private server-side caching is fine, with no time limit. Do **NOT**
   store Qloo response data in a public repository.

---

## 1. Getting an API key

### Hackathon (our path — free, no card)

- Join the hackathon on Devpost: https://qloo.devpost.com
- Submit the **API Key Request Form** linked from the hackathon guide and from
  rule 4 of the official rules:
  **https://forms.gle/zz12orkLHTAneLGz6**
  ("Qloo Agent Hackathon API Key Request Form" — this is the current Agentic
  Hackathon form.)
- Form fields (as rendered): `Email *`, `First Name *`, `Last Name *`,
  `Devpost Username *`, `GitHub Username`, `Location Country *`,
  `Project Idea *`, plus an agreement checkbox: agree to use the key for
  hackathon purposes only and accept the hackathon API rules.
  You do **not** need a finalised project idea to request a key.
- Delivery: **by email, provisioned manually — "typically issued within a few
  business days"** (guide). Check spam/junk — "keys often end up there".
  If nothing arrives after a few business days and spam is empty, resubmit the form.
- Keys are for hackathon use only, subject to Qloo's Terms of Use.

> ⚠️ Do not confuse this with the *previous* Qloo LLM Hackathon
> (qloo-hackathon.devpost.com), whose rules cite a different form
> (https://forms.gle/K1LVBUWReabqA3wQ8, "within 4 hours"). That was the earlier
> edition. For the Agentic Hackathon, use the form above and expect days, not hours.

### Commercial / general access (not our path)

The general onboarding page (https://docs.qloo.com/reference/api-onboarding) says
only: "To get started, you'll need an API key. Simply contact us, and we'll
generate one for you." There is **no public self-serve developer-portal signup**
documented. That page's examples use `https://staging.api.qloo.com`.

### What's public vs gated

- **Public, no login:** all of https://docs.qloo.com — API Overview, Hackathon
  Developer Guide, Insights Deep Dive (full parameter list), Parameter Reference,
  Entity Type Parameter Guide, endpoint reference pages, FAQs, Glossary, concepts
  (Affinity, Audiences, Cross-Category Insights).
- **Gated / non-functional without a key:** the interactive "Try It!" consoles on
  the reference pages render as `Loading…` in text extraction and require a real
  `X-Api-Key` to return data; every API host requires the key header.
- Two reference pages listed in the API Overview — **Get Tag Types**
  (`/reference/get-tag-types-1`) and **Get Audience Types**
  (`/reference/get-audience-types-1`) — returned **404** when fetched on
  2026-10-22. They are listed as endpoints in the docs index, but their exact
  paths/response shapes could not be verified. Do not hard-depend on them until
  tested with a live key.

---

## 2. Base URLs & authentication

| Environment | Base URL | Hackathon key works? |
|---|---|---|
| **Hackathon** | `https://hackathon.api.qloo.com` | ✅ **only here** |
| Staging | `https://staging.api.qloo.com` | ❌ 401 |
| Production | `https://api.qloo.com` | ❌ 401 (for hackathon keys) |

Auth header (all environments):

```
X-Api-Key: <your-api-key>
Content-Type: application/json
```

General-docs examples also write the header lower-cased as `x-api-key` — HTTP
headers are case-insensitive; use `X-Api-Key` as in the hackathon guide.

Python (verbatim pattern from the hackathon guide):

```python
import requests

headers = {"X-Api-Key": "YOUR_API_KEY"}
params = {"filter.type": "urn:entity:movie"}
response = requests.get(
    "https://hackathon.api.qloo.com/v2/insights",
    headers=headers,
    params=params,
)
print(response.json())
```

Node (from general onboarding docs — remember to swap in the hackathon base URL):

```js
const config = {
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.API_KEY,
  },
};
fetch('https://hackathon.api.qloo.com/v2/insights?query=audi', config)
```

---

## 3. Core concepts

- **Entity:** a person, place or thing in Qloo's taste graph, identified by a UUID
  `entity_id` (e.g. `369D1544-628B-4C21-95A0-1488117A308A`) and a URN type/subtype
  (e.g. `urn:entity:movie`). Qloo markets "250M+ entities" for this hackathon
  (their general marketing also says 575M+ people/places/things catalogued).
- **Affinity:** Qloo's score for how strongly an input (entity, tag, demographic,
  location) connects to an output. In Insights responses, per the Insights API
  docs page: **affinity scores range 0 to +1** (+1 = perfect match, 0 = no
  correlation), returned per result in the result's `query` object (see §6).
  Note the FAQ uses a 0–100 framing ("100 indicating a strong relationship") when
  explaining the same concept to non-developers — in the actual API JSON, work
  with the 0–1 values and the result ordering (`index`). Small score gaps
  (e.g. 0.92 vs 0.91) are not usually meaningful; rank order is.
- **Popularity:** 0–1 percentile within the entity's category
  (`properties`/`popularity` field; e.g. `0.9984`).
- **Tags:** URN IDs like `urn:tag:genre:media:comedy`,
  `urn:tag:keyword:media:multiverse`, `urn:tag:genre:place:restaurant:italian`.
  Tags are **not freeform strings** — IDs must come from `/v2/tags` or from
  entity payloads. There is no static tag list.
- **Signals vs Filters:** Filters specify *what kind of results you want*;
  Signals specify *what to base the recommendations on* and influence ranking:
  `signal.interests.entities`, `signal.interests.tags`, `signal.location.*`,
  `signal.demographics.*`.
- **Privacy:** no PII required or handled; inferences run on entity/location
  arrays only (GDPR/CCPA positioning in the docs). Good for our pitch: the
  concierge needs no personal data — just taste inputs.

---

## 4. Endpoint reference

All paths below are relative to the base URL. On the hackathon environment,
prefix them with `https://hackathon.api.qloo.com`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v2/insights` | **Primary.** Recommendations / insights / taste analysis |
| GET | `/search` | Resolve a name → Qloo entity IDs |
| GET | `/entities` | Fetch entities by ID (or by external IDs) |
| GET | `/v2/tags` | Search tags → valid tag IDs |
| GET | `/v2/audiences` | Find audience IDs (marked **deprecated** in reference) |
| GET | `/v2/analysis/compare` | Compare affinities of two entity groups |
| GET | `/v2/trending` | Weekly popularity time-series for an entity |
| GET | `/` | API info (version, deployment date, contact) — documented on prod host |

### 4.1 Search Entities — `GET /search`

Docs: https://docs.qloo.com/reference/get-search

Query params (copied from docs):

| Param | Type | Notes |
|---|---|---|
| `query` | string | The text to search against |
| `types` | array of strings | The category to search against |
| `filter.location` | string | lat/lon `40.742306,-74.003494`, WKT `POINT(-73.99823 40.722668)`, or a Qloo entity UUID |
| `filter.radius` | float, 0–100, default `10` | Max distance in **miles** from `filter.location`; geo categories only |
| `filter.exists` | array of strings | Existential property check, e.g. `external.resy`, `external.michelin` |
| `filter.tags` | — | Filter results by a tag (operator: `operator.filter.tags` = `union` \| `intersection`) |
| `filter.rating` | double, 0–5 | Lowest desired business rating |
| `filter.popularity` | double, 0–1 | Minimum popularity |
| `filter.address` | string, length ≥ 1 | Partial address match, comma-separated terms |
| `page` | int32, 1–100, default `1` | Page number |
| `take` | integer | Number of results to return |
| `sort_by` | string enum, default `match` | Sort criteria |

Legacy `types` values **available for search only, not supported in `/v2/insights`**:
`urn:entity:actor`, `urn:entity:album`, `urn:entity:author`,
`urn:entity:director`, `urn:entity:locality`.

> The reference page's response schema / "Try It" example did not render in text
> form ("Loading…"), so no verbatim `/search` response body is quoted here.
> Expected usage per the hackathon guide: "Use `/search` to look up Qloo entity
> IDs by name (e.g., for a movie, artist, or restaurant)" and take the top
> match's entity ID into Insights. Verify the exact response field names with
> the live key on day one — do not assume they mirror `/entities`.

### 4.2 Search Entities by ID — `GET /entities`

Docs: https://docs.qloo.com/reference/get-entities

Query params: `entity_ids` (array of UUIDs — "The entities to base the search
on"), plus external-ID lookups, all arrays of strings:

`external.facebook.ids`, `external.goodreads.ids` (books + authors),
`external.igdb.ids`, `external.imdb.ids`, `external.instagram.ids`,
`external.isbn10.ids`, `external.isbn13.ids`, `external.itunes.ids`,
`external.lastfm.ids`, `external.library_of_congress.ids`,
`external.metacritic.ids`, `external.michelin.ids`, `external.musicbrainz.ids`,
`external.resy.ids`, `external.rottentomatoes.ids`, `external.soundcloud.ids`,
`external.spotify.ids`, `external.tablet.ids`, `external.twitch.ids`,
`external.twitter.ids`, `external.wikidata.ids`.

Useful for us: if a user pastes a Spotify / IMDb link or ID, resolve it
directly instead of name-searching.

### 4.3 Insights — `GET /v2/insights`  ★ primary endpoint

Docs: https://docs.qloo.com/reference/insights-api-deep-dive ·
https://docs.qloo.com/reference/api-overview ·
use cases: https://docs.qloo.com/reference/use-cases

Required: `filter.type` (see hackathon list in the constraints box) **plus at
least one valid filter or signal**.

Full parameter set (from the Deep Dive / Parameter Reference; check the
Entity Type Parameter Guide before using any of them for a given `filter.type`):

**Filters — what to return**
- `filter.type` *(required)* — result category URN.
- `filter.tags` — comma-separated tag IDs; `operator.filter.tags` = `union` (any) \| `intersection` (all, default behaviour for signals differs — see docs).
- `filter.exclude.tags`, `operator.exclude.tags` (`union` default).
- `filter.exclude.entities` — comma-separated entity IDs to remove.
- `filter.results.entities` — comma-separated entity IDs; "Often used to assess the affinity of an entity towards input."
- `filter.results.entities.query` — name-based version (GET: single name).
- `filter.entities.query` — "A query string used to search for entity IDs to filter results."
- `filter.popularity.min` / `filter.popularity.max` — number 0–1.
- `filter.location` — lat/lon pair, WKT geometry, or Qloo entity UUID.
- `filter.location.query` — fuzzy text locality lookup (e.g. `New York City`, `The Big Apple`); GET = single locality string. Response includes `query.locality.signal` with the matched locality entity. No match → `400`.
- `filter.location.radius` — integer ≤ 800000, default `15000` (metres). With a locality, omitting it expands the boundary by the lesser of 10% of diameter or 2,414 m; `0` = strict boundary.
- `filter.geocode.name` / `filter.geocode.admin1_region` / `filter.geocode.admin2_region` / `filter.geocode.country_code` — exact matches on `properties.geocode.*` (Destination, Place).
- `filter.address` — partial string match.
- Place-only: `filter.price_level.min` / `.max` (1–4), `filter.price_range.from` / `.to` (0–1,000,000, hotels), `filter.hotel_class.min` / `.max` (1–5), `filter.rating.min` / `.max` (0–5 Qloo rating), `filter.properties.business_rating.min` / `.max`, `filter.external.resy.rating.min` / `.max` (0–5), `filter.external.resy.count.min` / `.max`, `filter.external.resy.party_size.min` / `.max`, `filter.external.tripadvisor.rating.min` / `.max` / `.rating.count.min` / `.max`, `filter.external.exists` (`resy` \| `michelin` \| `tablet`; operator `operator.filter.external.exists`), `filter.references_brand` (+ `operator.filter.references_brand`), `filter.hours` (weekday the POI must be open), `bias.quality` (place quality bias: `very_low`…`very_high` or a positive number), `sort_by=quality` / `distance` (distance requires `filter.location`).
- Movie/TV-only: `filter.release_year.min` / `.max`, `filter.release_date.min` / `.max`, `filter.release_country` (+ operator), `filter.content_rating` (e.g. `G,PG,PG-13,R,NC-17,TV-G,TV-PG,TV-14,TV-MA,TV-Y,TV-Y7,Not Rated,Unrated`), TV: `filter.finale_year.min` / `.max`, `filter.latest_known_year.min` / `.max`.
- Book-only: `filter.publication_year.min` / `.max`.
- Person-only: `filter.date_of_birth.min` / `.max`, `filter.date_of_death.min` / `.max`, `filter.gender`.
- `filter.parents.types` — comma-separated parental entity types.
- `filter.exists` — only return entities having a property, e.g. `properties.image`, `properties.description`.

**Signals — what to base recommendations on**
- `signal.interests.entities` — comma-separated entity IDs that influence the affinity score. **This is our main taste input.**
- `signal.interests.entities.weight` — ≥ 0, strength of the entity signal.
- `signal.interests.entities.include` — extra entity IDs to force into the interest-signal calculation.
- `signal.interests.tags` — GET: comma-separated tag IDs. `operator.signal.interests.tags`: `union` = results containing ≥1 tag, scored by highest-affinity tag; `intersection`/empty = results containing all tags, scores merged. Per-tag weights exist in the POST-body form in the general docs — **not usable under the hackathon GET-only rule**; use the signal-level weight instead: `signal.interests.tags.weight` ≥ 0.
- `signal.location` — WKT `POINT`/`POLYGON` or a locality Qloo ID.
- `signal.location.query` — fuzzy locality name (e.g. `New York City`, `Lower East Side`, `The Big Apple`); response includes `query.locality.signal` when used via the filter variant; no match → `400`.
- `signal.location.radius` — integer ≤ 800000 (metres, WKT POINT only).
- `signal.location.weight` — ≥ 0.
- `signal.demographics.age` — comma-separated: `35_and_younger` \| `36_to_55` \| `55_and_older`; plus `signal.demographics.age.weight` ≥ 0.
- `signal.demographics.gender` — `male` \| `female`; plus `signal.demographics.gender.weight` ≥ 0.
- `signal.demographics.audiences` — comma-separated audience IDs (from the audiences route); plus `signal.demographics.audiences.weight` ≥ 0. Hackathon guide warns these require **valid audience URN values** (see its FAQ reference).

**Output / tuning**
- `take` — integer 1–50, default `20`. `page` — int32 1–100, default `1`. `offset` — integer ≥ 0 (less common than `page`).
- `bias.trends` — enum, default `medium` (`off`, `very_low`, `low`, `mid`, `medium`, `high`, `very_high`): "Adjusts how much strength trends alter the result set."
- `bias.content_based` — number 0–1, default `0.5`: strength of content-based metadata in the affinity score.
- `diversify.by` / `diversify.take` — cap results per group (`properties.geocode.city`, `properties.geocode.metro`; `subtype` for `filter.type=urn:tag` only).
- `feature.explainability` — boolean, default `false`. **See §7 — this is our explanation engine.**
- Heatmap-only: `filter.type=urn:entity:heatmap`, `output.heatmap.boundary`, `heatmap.dimensions`, `filter.dimensions.hotel_class`, `filter.dimensions.price_level`.

### 4.4 Search Tags — `GET /v2/tags`

Docs: https://docs.qloo.com/reference/get-tags
"Search for tags that are supported by the `filter.tags`, `exclude.tags`, and
`signal.interests.tags` parameters."

Params: `filter.query` (partial string search on tag name),
`filter.tag.types` (comma-separated tag types, exact match),
`filter.parents.types`, `filter.results.tags` (tag IDs to assess affinity of),
`filter.popularity.min` / `.max` (0–1), `feature.typo_tolerance` (boolean,
default `false`), `feature.semantic_search` (boolean, default `false`, beta —
semantic instead of exact matching, used with `filter.query`),
`page` (1–100, default 1), `take` (1–50, default 20), `offset`.
Errors: `400` Bad Request, `500` Internal Server Error.

Taste Analysis response shape (Insights with `filter.type=urn:tag`) — results
come back under `results.tags[]`, **not** `results.entities[]`:

```json
{
  "success": true,
  "results": {
    "tags": [
      {
        "tag_id": "urn:tag:keyword:media:complex",
        "name": "Complex",
        "types": ["urn:entity:tv_show", "urn:entity:movie", "urn:entity:actor"],
        "subtype": "urn:tag:keyword:media",
        "tag_value": "urn:tag:keyword:media:complex",
        "query": {}
      }
    ]
  },
  "duration": 25
}
```

### 4.5 Get Audiences — `GET /v2/audiences` (deprecated in reference)

Docs: https://docs.qloo.com/reference/get-audiences — marked `get deprecated`.
"The Find Audiences API retrieves a list of audience IDs that can be used for
filtering results… You can use the returned audience IDs as values for
`signal.demographics.audiences`."
Params: `filter.query` (partial string search), `filter.audience.types`,
`filter.parents.types`, `filter.results.audiences`, `filter.popularity.min` /
`.max`, `page` / `take` (1–50, default 20) / `offset`.
Errors: `400`, `500`. Use sparingly; prefer entity/tag signals.

### 4.6 Analysis Compare — `GET /v2/analysis/compare`

Docs: https://docs.qloo.com/reference/analysis-compare
"Analyze and compare two groups of entities."
Required: `a.signal.interests.entities` (first group, array of entity IDs),
`b.signal.interests.entities` (second group). Optional: `filter.type`,
`filter.entities.query`, `filter.location.query`, `filter.location.radius`,
`filter.subtype`, `model`, `page` / `take` (1–50, default 20) / `offset`.
Nice-to-have for a "your taste vs. a friend's taste" feature; not core.

### 4.7 Get Trending Data — `GET /v2/trending`

Docs: https://docs.qloo.com/reference/get-trending
"Provides time-series data showing the popularity trends of a specific entity…
weekly trending statistics including population percentile, rank, velocity, and
acceleration metrics… ordered by date in descending order."
Required: `filter.type`, `filter.start_date`, `filter.end_date` (ISO `YYYY-MM-DD`).
Optional: `signal.interests.entities`, `take` (1–50, default 20), `page`, `offset`.
Errors: `400`, `500`.

### 4.8 Get API Information — `GET /`

Docs: https://docs.qloo.com/reference/api-information — documented against
`https://api.qloo.com/`. "Returns general information about the Qloo API,
including the current version, deployment date, and contact details."
The base URL alone is **not** a valid hackathon call (guide: appending no path
→ 404 / no response), so don't use this as a health check on the hackathon host
until verified with the key.

---

## 5. Entity categories → concierge mapping

Supported Insights `filter.type` values and what they mean for us:

| `filter.type` | Category | Concierge use |
|---|---|---|
| `urn:entity:artist` | Musicians / performing & visual artists | Taste **input** (user's favourite artists); also music recommendations |
| `urn:entity:movie` | Films | Taste input; film-night recommendations |
| `urn:entity:tv_show` | TV series | Taste input; watch-next recommendations |
| `urn:entity:place` | POIs: restaurants, cafés, bars, hotels, venues, landmarks | **Dining + nightlife + hotels output** (this is where restaurants live) |
| `urn:entity:destination` | Cities, neighbourhoods, areas people visit | **Trip output** — requires `signal.interests.entities` (Required for Destination per Entity Type Guide) |
| `urn:entity:brand` | Retail / consumer / service brands | Fashion & shopping output; also food brands |
| `urn:entity:book` | Books | Reading recommendations |
| `urn:entity:podcast` | Podcasts | Listening recommendations |
| `urn:entity:person` | Actors, directors, authors, public figures | People recommendations; replaces deprecated actor/author/director |
| `urn:entity:video_game` | Games | Gaming recommendations |

Cross-domain is the whole point: the **same** `signal.interests.entities` list
(e.g. an artist ID + a movie ID) can be sent with different `filter.type`
values to get places, destinations, brands, books, etc. that share that taste
profile. Qloo calls this "Cross-Category Insights".

Tag URN patterns seen in official examples:
- Genres (media): `urn:tag:genre:media:comedy`
- Keywords (media): `urn:tag:keyword:media:multiverse`, `urn:tag:keyword:media:historical_fiction`
- Place genres: `urn:tag:genre:place:restaurant:italian`
- Dining options: `urn:tag:dining_options:place:brunch`
- Brand genres: `urn:tag:genre:brand:food_beverage`
Always resolve real IDs via `/v2/tags?filter.query=…` — never hand-write a tag
URN and assume it exists.

---

## 6. Response shape (Insights)

Verbatim structure from the official onboarding / use-case examples
(truncated fields marked `…`):

```json
{
  "success": true,
  "results": {
    "entities": [
      {
        "name": "Django Unchained",
        "entity_id": "369D1544-628B-4C21-95A0-1488117A308A",
        "type": "urn:entity",
        "subtype": "urn:entity:movie",
        "properties": {
          "release_year": 2012,
          "release_date": "2012-12-25",
          "description": "With the help of a German bounty-hunter, a freed slave sets out to rescue his wife…",
          "content_rating": "R",
          "duration": 165,
          "image": { "url": "https://staging.images.qloo.com/i/369D1544-628B-4C21-95A0-1488117A308A-420x-outside.jpg" },
          "filming_location": "Evergreen Plantation - 4677 Highway 18, Edgard, Louisiana, USA",
          "production_companies": ["The Weinstein Company", "Columbia Pictures"],
          "release_country": ["United States"],
          "websites": ["https://…"],
          "akas": [{ "value": "Django Unchained", "languages": ["fy"] }]
        },
        "popularity": 0.9998529346882951,
        "tags": [
          { "id": "urn:tag:keyword:media:ex_slave", "name": "Ex Slave", "type": "urn:tag:keyword:media" },
          { "id": "urn:tag:streaming_service:media:apple_tv", "name": "Apple Tv", "type": "urn:tag:streaming_service:media" }
        ],
        "query": {
          "measurements": { "audience_growth": -0.04072975141723856 }
        },
        "disambiguation": "2022, Daniel Scheinert, Daniel Kwan",
        "external": {
          "imdb": [{ "id": "tt6710474", "user_rating": 7.8, "user_rating_count": 549113 }],
          "metacritic": [{ "id": "everything-everywhere-all-at-once", "critic_rating": 81, "user_rating": 7.8 }],
          "rottentomatoes": [{ "id": "everything_everywhere_all_at_once", "user_rating": "89", "user_rating_count": "2500" }],
          "wikidata": [{ "id": "q83808444" }],
          "instagram": [{ "id": "everythingeverywheremovie" }],
          "twitter": [{ "id": "allatoncemovie" }],
          "letterboxd": [{ "id": "everything-everywhere-all-at-once" }]
        }
      }
    ]
  },
  "duration": 22
}
```

Notes:
- Top level: `success` (bool), `results.entities[]` (or `results.tags[]` for
  Taste Analysis), `duration` (ms, server-side).
- Per entity: `name`, `entity_id` (UUID), `type` (`urn:entity`), `subtype`
  (the concrete category), `properties` (category-specific: films get
  `release_year`, `duration`, `content_rating`; places get geocode / address /
  price / rating properties), `popularity` (0–1), `tags[]` (`id`, `name`,
  `type`), `query` (per-result affinity measurements — and explainability when
  requested, §7), `disambiguation`, `external` (third-party IDs + ratings).
- Image URLs in docs examples are on `staging.images.qloo.com`; expect the host
  segment to follow the environment.
- Responses are verbose and **cannot be field-filtered** (guide FAQ: "The API
  returns the full response. Extract the fields you need on your side."). Budget
  for trimming `akas` / `short_descriptions` client-side.

Example requests from the docs (base URL swapped to hackathon host):

```bash
# Movies tagged comedy, released in/after 2022
curl --location 'https://hackathon.api.qloo.com/v2/insights/?filter.type=urn:entity:movie&filter.tags=urn:tag:genre:media:comedy&filter.release_year.min=2022' \
  --header 'X-Api-Key: <your-api-key>'

# Movies with high affinity in a neighbourhood (location as signal)
curl --location 'https://hackathon.api.qloo.com/v2/insights/?filter.type=urn:entity:movie&signal.location.query=Lower%20East%20Side' \
  --header 'X-Api-Key: <your-api-key>'
```

---

## 7. Explainability — why a recommendation matches ★

Parameter: **`feature.explainability=true`** on `/v2/insights`
(Insights Deep Dive, verbatim summary):

- Default is `false`. When `true`, "the response includes explainability
  metadata for each recommendation and for the overall result set."
- **Per recommendation:** each result includes a `query.explainability` section
  "showing which input entities (e.g., `signal.interests.entities`) contributed
  to the recommendation, with normalized scores between 0 and 1. Entities
  scoring ≥ 0.1 are always included; lower-impact entities may be omitted to
  reduce response size."
- **Aggregate impact:** a top-level `query.explainability` object "shows the
  average influence of each input entity across top-N result subsets
  (e.g., top 3, 5, 10, all)."
- If explainability can't be computed, results still return, with a warning at
  `query.explainability.warning`.

This is exactly what the concierge UI needs for "Because you love Radiohead +
Parasite → …" lines: map each result's top contributing input entity IDs back
to the user's seed names and render the 0–1 contribution scores. Complement
with the result's `tags[]` (shared genres/keywords/cuisines) for human-readable
reasons, and feed both into the LLM prompt for the final narrative.

Fallback explanation signals if explainability is empty for a result:
`query.measurements` on the result, the result's `tags[]` overlap with the
seed entities' `tags[]`, and its rank/popularity.

---

## 8. Recommended build flow (answers for the build team)

### (a) Resolve user taste inputs to entities
```
GET https://hackathon.api.qloo.com/search?query=Radiohead&types=urn:entity:artist
GET https://hackathon.api.qloo.com/search?query=Parasite&types=urn:entity:movie
```
- One `/search` call per free-text input; take the best match's entity ID.
- Check the `/search` docs for its accepted `types` values — they differ from
  Insights `filter.type` values and include legacy search-only types
  (`urn:entity:album`, `urn:entity:locality`, …).
- Alternatives/shortcuts documented in the parameters:
  - In Insights directly: `signal.interests.entities.query` / `filter.results.entities.query`
    / `filter.entities.query` resolve names inside an Insights call (GET form
    takes a single name) — handy, but explicit `/search` first gives us a
    confirm-the-match UI and reusable IDs.
  - If the user supplies an external ID (Spotify, IMDb, MusicBrainz, …), use
    `GET /entities?external.spotify.ids=…` / `external.imdb.ids=…`.
  - For non-entity interests ("jazz", "Italian food", "cyberpunk"), use
    `GET /v2/tags?filter.query=jazz` (optionally `feature.semantic_search=true`)
    and pass IDs as `signal.interests.tags` / `filter.tags`.

### (b) Cross-domain recommendations (dining, places, travel)
One seed ID list → many Insights calls, varying only `filter.type`:

```bash
SEEDS="<radiohead_id>,<parasite_id>"

# Dining / nightlife / hotels in a city
GET /v2/insights?filter.type=urn:entity:place
    &signal.interests.entities=$SEEDS
    &filter.location.query=Lagos            # or signal.location.query=Lagos
    &feature.explainability=true&take=10

# Trip destinations (signal.interests.entities is REQUIRED for destination)
GET /v2/insights?filter.type=urn:entity:destination
    &signal.interests.entities=$SEEDS
    &feature.explainability=true&take=10

# Fashion / shopping brands
GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=$SEEDS&take=10

# More of what they already love (deepen the profile)
GET /v2/insights?filter.type=urn:entity:movie&signal.interests.entities=$SEEDS&take=10
GET /v2/insights?filter.type=urn:entity:artist&signal.interests.entities=$SEEDS&take=10
GET /v2/insights?filter.type=urn:entity:book&signal.interests.entities=$SEEDS&take=10
GET /v2/insights?filter.type=urn:entity:tv_show&signal.interests.entities=$SEEDS&take=10
```

There is **no separate "events" entity type** in the supported list. For
"events", use `urn:entity:place` (venues) with place tag filters (resolve via
`/v2/tags`) and/or artist/person recommendations — do not invent an
`urn:entity:event` type (it would 403 / be ignored).

Location handling:
- Constrain place results geographically with `filter.location.query=<city>`
  (hard filter) or bias them with `signal.location.query=<city>` (signal).
- Mind the radius defaults (`filter.location.radius` default 15000 m; locality
  padding behaviour in §4.3). A 400 usually means the locality didn't resolve.

### (c) Explain why a recommendation matches
1. Always send `feature.explainability=true`.
2. Read per-result `query.explainability` → which seed entity IDs drove this
   result, with 0–1 normalised contribution scores (≥ 0.1 guaranteed present).
3. Read top-level `query.explainability` → average influence of each seed
   across top 3 / 5 / 10 / all — good for a "your taste profile" summary panel.
4. Join IDs back to seed names for display; attach shared `tags[]` names
   (cuisine, genre, keywords) as secondary reasons; hand affinity +
   contributions + tags to the LLM to write the final one-line rationale.
5. Handle `query.explainability.warning` gracefully (fall back to tags/rank).

### Taste profile (bonus, cheap to add)
```
GET /v2/insights?filter.type=urn:tag&signal.interests.entities=$SEEDS&take=20
```
Taste Analysis returns `results.tags[]` describing the seed set — use as the
user's "taste DNA" chips. (Caveat in §0.6: `urn:tag` isn't in the hackathon
guide's filter.type list — verify with the live key; if it 403s, derive the
profile from the seeds' own `tags[]` instead.)

---

## 9. Errors & troubleshooting (from the hackathon guide + reference docs)

| Symptom | Cause / fix |
|---|---|
| `401 Unauthorized` | Wrong base URL (you used staging/prod with a hackathon key) — switch to `https://hackathon.api.qloo.com` |
| `401 "No API key found in request"` | Key sent as Bearer token or query param — send header `X-Api-Key: <key>` |
| `404` / no response | Called the base URL with no path — always append e.g. `/v2/insights` |
| `404` / "No path matching request parameters" | POSTed JSON to `/v2/insights` — it's GET with query-string params; or you used a legacy path (`/recs`, `/recommendations`) |
| `403 "You do not have permission to access urn:entity:…"` | Unsupported `filter.type` — use the hackathon list (§0.6) |
| `"at least one valid signal or filter is required"` | Your signal/filter IDs are freeform strings, not Qloo IDs — resolve via `/search` / `/v2/tags` / audiences first |
| `200` but `entities: []` | (1) A parameter isn't valid for that `filter.type` and was silently ignored — check the Entity Type Parameter Guide; (2) hackathon dataset has no data for that entity/location — broaden the query or change seed/location |
| `400` on location params | Locality name didn't fuzzy-match — try a larger/standard locality name |
| `400` / `500` (tags, audiences, trending) | Documented error responses on those endpoints — validate params, retry |

Support channel: Qloo Hackathon Discord, **#api-help** (linked from the guide).

---

## 10. Sources

Official (docs.qloo.com unless noted):
- Hackathon Developer Guide — https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
- API Onboarding and Authentication — https://docs.qloo.com/reference/api-onboarding
- API Overview — https://docs.qloo.com/reference/api-overview
- Insights API (concept) — https://docs.qloo.com/docs/insights-api
- Insights API Deep Dive — https://docs.qloo.com/reference/insights-api-deep-dive
- Parameter Overview / Parameter Reference / Entity Type Parameter Guide —
  https://docs.qloo.com/reference/parameter-overview ·
  https://docs.qloo.com/reference/parameters ·
  https://docs.qloo.com/reference/available-parameters-by-entity-type
- Search Entities — https://docs.qloo.com/reference/get-search
- Search Entities by ID — https://docs.qloo.com/reference/get-entities
- Search Tags — https://docs.qloo.com/reference/get-tags
- Get Audiences — https://docs.qloo.com/reference/get-audiences
- Analysis Compare — https://docs.qloo.com/reference/analysis-compare
- Get Trending Data — https://docs.qloo.com/reference/get-trending
- Get API Information — https://docs.qloo.com/reference/api-information
- Key Use Cases / Recommendation Insights / Location-Based Insights / Taste Analysis —
  https://docs.qloo.com/reference/use-cases and linked pages
- Affinity (concept) — https://docs.qloo.com/docs/affinity-score
- FAQs — https://docs.qloo.com/docs/faqs
- Devpost: Qloo Agentic Hackathon + Official Rules — https://qloo.devpost.com/ · https://qloo.devpost.com/rules
- API key form (Agentic Hackathon) — https://forms.gle/zz12orkLHTAneLGz6

Not used as API truth (marketing / third-party only): Qloo's SourceForge/
Slashdot/G2 listings (575M entities, category blurbs) and prior-hackathon
Devpost projects — mentioned only where flagged.

### Open items to verify with the live key (day one)
1. Exact `/search` response field names for the matched entity ID.
2. Whether `filter.type=urn:tag` (Taste Analysis) and `urn:entity:heatmap`
   work on the hackathon host, since they're absent from the guide's list.
3. Whether `GET /` responds on `hackathon.api.qloo.com`.
4. Real per-result affinity field location in hackathon responses (docs show
   affinity via `query` / explainability; confirm field names on a live place
   query, since most verbatim examples in the docs are movies).
5. Get Tag Types / Get Audience Types endpoint paths (docs pages 404'd).
