// src/qloo.js — Qloo taste-graph data layer
//
// ============================================================================
// MOCK LAYER — clearly marked. When QLOO_API_KEY is set, the live Qloo calls
// below run first and this module falls back to the mock data on ANY failure,
// so the demo always works end-to-end for judges.
//
// Confirmed Qloo hackathon API facts (verified Oct 22, 2026 — see
// docs/QLOO-API.md, researched from docs.qloo.com):
//   - Base URL: https://hackathon.api.qloo.com  — MUST be this host.
//     Other Qloo base URLs return 401 with hackathon keys.
//   - Auth: header `X-Api-Key: <key>` ONLY — not Bearer, not a query param.
//   - Insights is GET-only: GET /v2/insights with QUERY-STRING params.
//     POSTing a JSON body fails ("No path matching request parameters").
//   - Entity resolution: GET /search?query=<name>&types=urn:entity:artist
//     (or urn:entity:movie) — take the top match's entity UUID.
//   - Recommendations: GET /v2/insights?filter.type=<type>
//     &signal.interests.entities=<comma-separated seed UUIDs>
//     &feature.explainability=true&take=<n>
//       Dining  → filter.type=urn:entity:place + filter.location.query=<city>
//       Events  → NO event entity type exists; venues via urn:entity:place
//       Trips   → filter.type=urn:entity:destination
//                 (signal.interests.entities is REQUIRED for destinations)
//   - Place results are affinity-ranked across ALL place kinds (banks,
//     schools and radio stations outrank restaurants in raw affinity), so
//     dining/events are separated CLIENT-SIDE: a wide pool (take=30) plus a
//     restaurant-tag-targeted call are merged, then classified from each
//     entity's `urn:tag:category:place:*` tags, `urn:tag:genre:place:*`
//     tags and properties.primary_genre (see classifyPlace). Blocked
//     service categories (bank, school, media…) never lead a section;
//     they only backfill as a last resort so a section is never empty.
//     Server-side filter.tags=<restaurant genre tag> helps the dining pool
//     but is a SOFT filter (off-category results still appear), and
//     filter.exclude.tags did NOT remove genre-blocked places in live
//     tests — classification must stay client-side. (Verified Oct 23.)
//   - Explanations come from each result's query.explainability (which seed
//     entities contributed, 0–1 scores) + shared tags[] names.
//   - Do NOT use legacy /recommendations or /recs endpoints anywhere.
//
// To wire the real API fully:
//   1. Set the secret:  wrangler secret put QLOO_API_KEY
//   2. (Optional) Set QLOO_API_BASE var — defaults to https://hackathon.api.qloo.com
//      (leave it at the default for hackathon keys; see above).
//   3. The shapes returned by resolveEntities() / getRecommendations() are
//      the contract the rest of the app consumes — keep those stable.
// ============================================================================

const DEFAULT_BASE = "https://hackathon.api.qloo.com";
const INSIGHTS_PATH = "/v2/insights"; // Insights API — GET only, query-string params
const SEARCH_PATH = "/search"; // Entity resolution — GET, one call per input name

// ---------------------------------------------------------------------------
// Mock knowledge base: taste signals keyed by normalised artist / film names.
// Unknown inputs still produce sensible generic recommendations (see fallback).
// ---------------------------------------------------------------------------
const TASTE_PROFILES = {
  // Artists
  "burna boy": { tags: ["afrobeats", "highlife", "lagos-nightlife", "live-music"], cuisine: ["west-african", "grill", "jollof"], mood: "energetic, celebratory" },
  "tems": { tags: ["alté", "r&b", "soulful"], cuisine: ["modern-african", "small-plates"], mood: "intimate, soulful" },
  "wizkid": { tags: ["afrobeats", "r&b", "smooth"], cuisine: ["lounge", "cocktails"], mood: "smooth, late-night" },
  "kendrick lamar": { tags: ["hip-hop", "conscious", "jazz-rap"], cuisine: ["soul-food", "smokehouse"], mood: "thoughtful, intense" },
  "beyoncé": { tags: ["pop", "r&b", "empowering"], cuisine: ["upscale", "brunch"], mood: "bold, celebratory" },
  "beyonce": { tags: ["pop", "r&b", "empowering"], cuisine: ["upscale", "brunch"], mood: "bold, celebratory" },
  "the weeknd": { tags: ["dark-r&b", "synth", "noir"], cuisine: ["late-night", "speakeasy"], mood: "moody, nocturnal" },
  "billie eilish": { tags: ["alt-pop", "minimal", "gen-z"], cuisine: ["vegan", "experimental"], mood: "minimal, offbeat" },
  "coldplay": { tags: ["arena-rock", "uplifting"], cuisine: ["family-friendly", "global"], mood: "uplifting, communal" },
  "ed sheeran": { tags: ["acoustic", "singer-songwriter"], cuisine: ["pub", "comfort-food"], mood: "warm, unpretentious" },
  // Films
  "black panther": { tags: ["afrofuturism", "marvel", "wakanda"], cuisine: ["west-african", "pan-african"], mood: "proud, futuristic" },
  "spider-man: into the spider-verse": { tags: ["animation", "comic-book", "street-art"], cuisine: ["street-food", "fusion"], mood: "playful, inventive" },
  "into the spider-verse": { tags: ["animation", "comic-book", "street-art"], cuisine: ["street-food", "fusion"], mood: "playful, inventive" },
  "parasite": { tags: ["thriller", "korean-cinema", "satire"], cuisine: ["korean", "noodle-bar"], mood: "sharp, unpredictable" },
  "amelie": { tags: ["french-cinema", "whimsical", "romance"], cuisine: ["french", "patisserie", "cafe"], mood: "whimsical, romantic" },
  "amélie": { tags: ["french-cinema", "whimsical", "romance"], cuisine: ["french", "patisserie", "cafe"], mood: "whimsical, romantic" },
  "the dark knight": { tags: ["noir", "crime", "gritty"], cuisine: ["steakhouse", "speakeasy"], mood: "dark, intense" },
  "la la land": { tags: ["musical", "jazz", "romance"], cuisine: ["jazz-bar", "bistro"], mood: "dreamy, nostalgic" },
  "dune": { tags: ["sci-fi", "epic", "desert"], cuisine: ["middle-eastern", "spice-forward"], mood: "epic, immersive" },
  "everything everywhere all at once": { tags: ["multiverse", "absurdist", "family"], cuisine: ["fusion", "dim-sum"], mood: "chaotic, heartfelt" },
};

function normalise(name) {
  return String(name || "").trim().toLowerCase();
}

function profileFor(name) {
  return TASTE_PROFILES[normalise(name)] || null;
}

function deriveProfile(artists, films) {
  const tags = new Set();
  const cuisines = new Set();
  const moods = [];
  const matched = [];
  const unmatched = [];

  for (const name of [...artists, ...films]) {
    const p = profileFor(name);
    if (p) {
      matched.push(name);
      p.tags.forEach((t) => tags.add(t));
      p.cuisine.forEach((c) => cuisines.add(c));
      moods.push(p.mood);
    } else {
      unmatched.push(name);
    }
  }
  // Generic fallback signals so any input yields a coherent plan.
  if (tags.size === 0) {
    ["eclectic", "well-reviewed", "local-favourites"].forEach((t) => tags.add(t));
    ["modern", "seasonal"].forEach((c) => cuisines.add(c));
    moods.push("curious, open-minded");
  }
  return {
    tags: [...tags],
    cuisines: [...cuisines],
    mood: moods[0] || "curious, open-minded",
    matched,
    unmatched,
  };
}

// ---------------------------------------------------------------------------
// Live Qloo client — GET only, X-Api-Key header, query-string params.
// Every helper returns null on ANY failure so callers fall back to mock.
// ---------------------------------------------------------------------------

async function qlooGet(env, pathName, params) {
  const key = env?.QLOO_API_KEY;
  if (!key) return null;
  const base = (env?.QLOO_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  try {
    const res = await fetch(`${base}${pathName}?${qs.toString()}`, {
      method: "GET",
      headers: { "X-Api-Key": key }, // the ONLY auth mechanism Qloo accepts
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.success === false) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Resolve one free-text name to a Qloo entity via GET /search.
 * Takes the top match's entity UUID. VERIFIED live shape (Oct 23, 2026):
 * top-level `results` is a BARE ARRAY of hits, each
 * { name, entity_id (UUID), types: [...], popularity (0–1), tags: [{name,…}] }.
 * The wrapped variants below are kept as harmless defensive fallbacks.
 */
async function searchEntity(env, name, typeUrn) {
  const data = await qlooGet(env, SEARCH_PATH, {
    query: name,
    types: typeUrn,
    take: 5,
  });
  if (!data) return null;
  const hits = Array.isArray(data?.results?.entities)
    ? data.results.entities
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.entities)
        ? data.entities
        : [];
  const hit = hits[0];
  const id = hit?.entity_id || hit?.id;
  if (!hit || !id) return null;
  return {
    name: hit.name || name,
    type: typeUrn === "urn:entity:artist" ? "artist" : "movie",
    id: String(id),
    tags: Array.isArray(hit.tags) ? hit.tags.map((t) => t?.name).filter(Boolean) : [],
  };
}

/** One Insights call. Returns the results.entities array, or null on failure. */
async function insights(env, params) {
  const data = await qlooGet(env, INSIGHTS_PATH, params);
  const list = data?.results?.entities;
  return Array.isArray(list) ? list : null;
}

/**
 * Normalise a result's query.explainability into [{ id, score }] sorted desc.
 * VERIFIED live shape (Oct 23, 2026):
 *   query.explainability = { "signal.interests.entities":
 *     [ { entity_id, score }, … ] }   — scores are signal shares, sum ≈ 1.
 * Other nestings are still defensive-parsed. A `warning` from Qloo means
 * explainability could not be computed → treat as absent (caller falls back
 * to tags/rank for the "why" line).
 */
function explainabilityContributions(entity) {
  const ex = entity?.query?.explainability;
  if (!ex || typeof ex !== "object" || ex.warning) return [];
  const raw = ex.entities || ex.contributions || ex.scores || ex;
  const out = [];
  const pushItem = (item) => {
    const id = item?.entity_id || item?.id || item?.entity;
    const score = Number(item?.score ?? item?.contribution ?? item?.weight ?? item?.value);
    if (id && Number.isFinite(score)) out.push({ id: String(id), score });
  };
  if (Array.isArray(raw)) {
    raw.forEach(pushItem);
  } else if (raw && typeof raw === "object") {
    for (const [key, v] of Object.entries(raw)) {
      if (Array.isArray(v)) {
        // Real shape: { "signal.interests.entities": [{ entity_id, score }] }
        v.forEach(pushItem);
      } else {
        const score = Number(
          v && typeof v === "object" ? (v.score ?? v.contribution ?? v.weight ?? v.value) : v,
        );
        if (Number.isFinite(score)) out.push({ id: key, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function tagNames(entity) {
  return Array.isArray(entity?.tags) ? entity.tags.map((t) => t?.name).filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Place classification — Qloo ranks places by taste affinity across ALL
// place kinds, so raw results mix restaurants with banks, schools and radio
// stations. Every place carries machine-readable category data (verified
// live Oct 23, 2026):
//   - tags of type "urn:tag:category:place" → e.g. urn:tag:category:place:bank
//   - tags of type "urn:tag:genre:place"    → e.g. …:restaurant:barbecue
//   - properties.primary_genre.id          → e.g. urn:tag:genre:place:hotel
//   - properties.cuisine_description / tags of type urn:tag:dining_options:*
// We classify from those signals — never from the affinity score itself.
// ---------------------------------------------------------------------------

const GENRE_PREFIX = "urn:tag:genre:place:";
const CATEGORY_PREFIX = "urn:tag:category:place:";

/** Food & drink signal in a genre leaf / category slug. */
const FOOD_RE =
  /restaurant|cafe|coffee|bakery|eatery|diner|bistro|steakhouse|pizzeria|sushi|ramen|noodle|barbecue|bbq|grill|dessert|ice_cream|juice|tea_house|brewery|brewpub|winery|cafeteria|food|pub|bar(?::|$|_)|lounge_bar/;
/** Experience / venue signal (events bucket). */
const EXPERIENCE_RE =
  /hotel|night_club|live_music|movie_theater|cinema|theatre|theater|museum|gallery|art_center|art_gallery|tourist_attraction|landmark|monument|memorial|sculpture|palace|scenic|observation|arena|stadium|event_venue|events_cent|casino|market|park|natural_feature|plaza|spa|resort|swim_club|lounge|visitor_center|library|zoo|aquarium|botanical|comedy|concert|performing_arts|club/;
/** Pure services / non-visit categories — never lead a section. */
const BLOCKED_RE =
  /bank|atm|corporate_office|office|school|university|college|military|non_governmental|\bngo\b|media_house|radio|record_company|recording_studio|movie_studio|film_production|pharmacy|hospital|clinic|psychotherap|mental_health|counsel|pentecostal|church|mosque|synagogue|place_of_worship|architect|engineer|interior_design|tattoo|barber|government|police|funeral|real_estate|insurance|lawyer|law_firm|dentist|doctor|veterinar|gas_station|car_wash|car_rental|storage|warehouse|logistics|coworking|training_center|computer_support|video_production|photography_studio|video_editing|post_office|courthouse|embassy/;
/** Retail-led places are shopping, not experiences. */
const RETAIL_RE = /gift_shop|clothing_store|antique_store|book_store|store|shop|shopping|mall/;
/** Obvious non-fit name patterns (secondary signal only). */
const NAME_BLOCK_RE = /\b(bank|atm|radio|pharmacy|hospital|clinic|school|university|church|mosque)\b|\bfm\b/i;

function placeSignals(entity) {
  const tags = Array.isArray(entity?.tags) ? entity.tags : [];
  const cats = [];
  const genres = [];
  let hasDiningOptions = false;
  for (const t of tags) {
    const id = String(t?.id || "");
    if (t?.type === "urn:tag:category:place" && id.startsWith(CATEGORY_PREFIX)) cats.push(id.slice(CATEGORY_PREFIX.length));
    else if (t?.type === "urn:tag:genre:place" && id.startsWith(GENRE_PREFIX)) genres.push(id.slice(GENRE_PREFIX.length));
    else if (String(t?.type || "").startsWith("urn:tag:dining_options")) hasDiningOptions = true;
  }
  const pg = entity?.properties?.primary_genre;
  const pgId = typeof pg?.id === "string" ? pg.id : "";
  const primaryLeaf = pgId.startsWith(GENRE_PREFIX) ? pgId.slice(GENRE_PREFIX.length) : "";
  if (primaryLeaf && !genres.includes(primaryLeaf)) genres.unshift(primaryLeaf);
  return {
    cats,
    genres,
    primaryLeaf,
    primaryGenreName: typeof pg?.name === "string" ? pg.name : "",
    hasDiningOptions,
    hasCuisineDesc: Boolean(entity?.properties?.cuisine_description),
    liveMusic: entity?.properties?.live_music === true,
  };
}

/**
 * Classify one live place entity.
 * Returns { home: "dining"|"events"|null, dining, events, blocked } —
 * `home` is the bucket the place belongs to on its strongest signal;
 * blocked places are pure services and only ever backfill (last resort).
 */
function classifyPlace(entity) {
  const s = placeSignals(entity);
  const leaf = s.primaryLeaf || "";
  const catText = s.cats.join(" ");
  const genreText = s.genres.join(" ");

  const foodPrimary = FOOD_RE.test(leaf);
  const foodAny = foodPrimary || FOOD_RE.test(catText) || FOOD_RE.test(genreText);
  const foodSignal = foodAny || s.hasCuisineDesc || s.hasDiningOptions;

  // A blocked primary genre (studio, bank…) wins over incidental tag-level
  // food tags — unless the place is primarily a food venue itself.
  const blockedHit =
    BLOCKED_RE.test(leaf) || BLOCKED_RE.test(catText) || NAME_BLOCK_RE.test(String(entity?.name || ""));
  const blocked = blockedHit && !leaf.startsWith("restaurant") && !leaf.includes(":restaurant");

  const experienceSignal = EXPERIENCE_RE.test(leaf) || EXPERIENCE_RE.test(catText) || s.liveMusic;
  const retailPrimary = RETAIL_RE.test(leaf);

  let dining = foodSignal && !blocked;
  // Retail-led places (gift shops, stores) are not experiences; a hotel or
  // venue that merely contains a shop still qualifies via its own leaf.
  let events = !blocked && experienceSignal && !(retailPrimary && !EXPERIENCE_RE.test(leaf));

  // Primary-genre identity wins for tier-1 slots: a place whose PRIMARY
  // genre is retail (an antique store that happens to contain a café, a
  // shopping mall with a food court) reads as retail to a human, whatever
  // its secondary tags say. Demote it to the unclassified backfill tier —
  // unless food IS its primary genre.
  if (retailPrimary && !foodPrimary) {
    dining = false;
    events = false;
  }

  let home = null;
  if (dining && events) home = foodPrimary ? "dining" : "events";
  else if (dining) home = "dining";
  else if (events) home = "events";
  return { home, dining, events, blocked, signals: s };
}

/** Short display tags for a pick (genre/category names Qloo attached). */
function displayTags(entity) {
  const s = placeSignals(entity);
  const out = [];
  const push = (v) => {
    const label = titleCase(String(v || "").replace(/_/g, " ").replace(/:/g, " · "));
    if (label && !out.some((x) => x.toLowerCase() === label.toLowerCase())) out.push(label);
  };
  if (s.primaryGenreName) push(s.primaryGenreName);
  for (const g of s.genres) push(g.split(":").pop());
  for (const c of s.cats) push(c);
  // Destinations (and anything without place categories): use raw tag names.
  if (!out.length) for (const n of tagNames(entity)) push(n);
  return out.slice(0, 3);
}

function buildWhy(entity, seedById) {
  const shared = tagNames(entity).slice(0, 3).join(", ");
  const contribs = explainabilityContributions(entity);
  if (contribs.length) {
    const drivers = contribs
      .slice(0, 2)
      .map((c) => `${seedById.get(c.id) || "one of your picks"} (${Math.round(c.score * 100)}% of the signal)`)
      .join(" and ");
    return (
      `Qloo's taste graph drove this from your love of ${drivers}` +
      (shared ? ` — connected through shared taste signals: ${shared}.` : ".")
    );
  }
  // Explainability unavailable (or warning) → fall back to shared tags + rank.
  const seedNames = [...seedById.values()].slice(0, 2).join(" + ");
  return (
    `A top taste-graph match for ${seedNames || "your picks"}` +
    (shared ? `, sharing taste signals like ${shared}` : "") +
    "."
  );
}

function matchScore(entity, index) {
  // VERIFIED live: each Insights result carries query.affinity (0–1) — that
  // is the match strength. Explainability scores are signal *shares* (they
  // sum to ~1 across seeds), so they belong in the "why" line, not the score.
  const aff = Number(entity?.query?.affinity);
  if (Number.isFinite(aff) && aff > 0) return Math.min(1, Math.max(0, aff));
  if (typeof entity?.popularity === "number") return Math.min(1, Math.max(0, entity.popularity));
  return Math.max(0.5, 0.95 - index * 0.04); // rank-decay fallback
}

function subtypeLabel(entity, fallback) {
  // Verified live: properties.primary_genre.name is the cleanest category
  // label Qloo gives a place ("Restaurant", "Hotel", "Art gallery"…).
  const pgName = entity?.properties?.primary_genre?.name;
  if (typeof pgName === "string" && pgName) return pgName;
  const genreTag = (entity?.tags || []).find(
    (t) => typeof t?.type === "string" && t.type.startsWith("urn:tag:genre"),
  );
  if (genreTag?.name) return genreTag.name;
  const sub = String(entity?.subtype || "").replace("urn:entity:", "").replace(/_/g, " ");
  return sub ? titleCase(sub) : fallback;
}

function entityArea(entity, fallback) {
  const geo = entity?.properties?.geocode;
  if (geo && typeof geo === "object") return geo.city || geo.name || geo.admin1_region || fallback;
  if (typeof entity?.properties?.address === "string" && entity.properties.address) {
    return entity.properties.address;
  }
  return fallback;
}

function priceHint(entity) {
  const lvl = entity?.properties?.price_level;
  return typeof lvl === "number" && lvl >= 1 && lvl <= 4 ? "$".repeat(lvl) : undefined;
}

/** Map one live Insights entity into the app's recommendation contract. */
function mapRec(entity, index, seedById, { categoryFallback, areaFallback }) {
  const rec = {
    name: entity?.name || "Untitled",
    category: subtypeLabel(entity, categoryFallback),
    score: matchScore(entity, index),
    why: buildWhy(entity, seedById),
    area: entityArea(entity, areaFallback),
    tags: displayTags(entity),
  };
  const price = priceHint(entity);
  if (price) rec.priceHint = price;
  return rec;
}

const RESTAURANT_GENRE_TAG = "urn:tag:genre:place:restaurant";

/**
 * Fill one bucket (3 slots) from classified candidates, in tier order:
 *   1. places whose home bucket this is (strongest on-category signal)
 *   2. places classified for the OTHER bucket (a hotel still works as an
 *      events backfill for dining — it has a restaurant; a great restaurant
 *      is still a night out) — only when `other` is allowed for this bucket
 *   3. unclassified, non-blocked places (unknown kind, real affinity)
 *   4. blocked pure services (bank, school…) — LAST resort only, so a
 *      section is never empty; they never lead a section when any
 *      visit-worthy candidate exists.
 * Returns the picked entities; picked IDs are added to `used`.
 */
function fillBucket(classified, home, other, used) {
  const picks = [];
  const tiers = [
    (c) => c.home === home && !used.has(c.id),
    (c) => c.home === other && !used.has(c.id),
    (c) => !c.blocked && !c.home && !used.has(c.id),
    (c) => c.blocked && !used.has(c.id),
  ];
  for (const tier of tiers) {
    for (const c of classified) {
      if (picks.length >= 3) break;
      if (tier(c)) {
        picks.push(c.entity);
        used.add(c.id);
      }
    }
    if (picks.length >= 3) break;
  }
  return picks;
}

/**
 * Live recommendations off one seed UUID list. Place candidates come from
 * two GET /v2/insights calls — a wide affinity pool (take=30) and a
 * restaurant-tag-targeted call (take=15) — merged by affinity and split
 * into Dining / Events client-side by classifyPlace(). Filtering NEVER
 * fails the whole plan: buckets backfill by tier (see fillBucket), and the
 * function only returns null when Qloo itself returns nothing usable —
 * the caller then falls back to the mock layer as before.
 */
async function liveRecommendations({ city, entities }, env) {
  const seeds = (entities || []).filter((e) => e?.id && !String(e.id).startsWith("mock:"));
  if (!seeds.length) return null;
  const seedIds = seeds.map((e) => e.id).join(",");
  const seedById = new Map(seeds.map((e) => [String(e.id), e.name]));
  const signals = {
    "signal.interests.entities": seedIds,
    "feature.explainability": "true",
  };

  // Wide pool — the raw taste ranking across every place kind in the city.
  const poolRaw = await insights(env, {
    ...signals,
    "filter.type": "urn:entity:place",
    "filter.location.query": city,
    take: 30,
  });
  if (!poolRaw?.length) return null;

  // Dining-targeted call — filter.tags with the restaurant genre tag is a
  // SOFT server-side filter (verified live: off-category results still
  // appear), but it pulls genuine restaurants far up the list in cities
  // where the raw pool is all galleries/landmarks. Best-effort: a failure
  // here just means the pool alone feeds classification.
  const diningRaw =
    (await insights(env, {
      ...signals,
      "filter.type": "urn:entity:place",
      "filter.location.query": city,
      "filter.tags": RESTAURANT_GENRE_TAG,
      take: 15,
    })) || [];

  // Merge + dedupe by entity ID, then order by affinity (the taste signal
  // we must not lose) — classification decides the bucket, affinity the rank.
  const byId = new Map();
  for (const e of [...poolRaw, ...diningRaw]) {
    const id = String(e?.entity_id || e?.id || "");
    if (id && !byId.has(id)) byId.set(id, e);
  }
  const affinityOf = (e) => {
    const a = Number(e?.query?.affinity);
    return Number.isFinite(a) ? a : typeof e?.popularity === "number" ? e.popularity : 0;
  };
  const classified = [...byId.values()]
    .sort((a, b) => affinityOf(b) - affinityOf(a))
    .map((entity) => ({
      entity,
      id: String(entity?.entity_id || entity?.id),
      ...classifyPlace(entity),
    }));

  const used = new Set();
  const dining = fillBucket(classified, "dining", "events", used);
  const events = fillBucket(classified, "events", "dining", used);
  if (!dining.length || !events.length) return null;

  // Trips — destinations. signal.interests.entities is REQUIRED for this type.
  const tripsRaw = await insights(env, {
    ...signals,
    "filter.type": "urn:entity:destination",
    take: 3,
  });
  if (!tripsRaw?.length) return null;

  return {
    dining: dining.map((e, i) => mapRec(e, i, seedById, { categoryFallback: "Restaurant", areaFallback: city })),
    events: events.map((e, i) => mapRec(e, i, seedById, { categoryFallback: "Venue", areaFallback: city })),
    trips: tripsRaw.map((e, i) => mapRec(e, i, seedById, { categoryFallback: "Destination", areaFallback: "Destination" })),
  };
}

// ---------------------------------------------------------------------------
// Public API — stable contract for the rest of the app
// ---------------------------------------------------------------------------

/**
 * Resolve free-text artist / film names to taste entities.
 * Live: one GET /search call per input, top match's UUID.
 * Returns: [{ name, type: "artist"|"movie", id, tags }]
 */
export async function resolveEntities({ artists = [], films = [] }, env = {}) {
  if (env?.QLOO_API_KEY) {
    const live = [];
    for (const name of artists) {
      const e = await searchEntity(env, name, "urn:entity:artist");
      if (e) live.push(e);
    }
    for (const name of films) {
      const e = await searchEntity(env, name, "urn:entity:movie");
      if (e) live.push(e);
    }
    if (live.length) return live;
    // Nothing resolved live → fall through to mock entities.
  }

  // MOCK fallback
  const out = [];
  for (const name of artists) {
    const p = profileFor(name);
    out.push({ name, type: "artist", id: "mock:artist:" + normalise(name).replace(/\s+/g, "-"), tags: p ? p.tags : ["music"] });
  }
  for (const name of films) {
    const p = profileFor(name);
    out.push({ name, type: "movie", id: "mock:movie:" + normalise(name).replace(/\s+/g, "-"), tags: p ? p.tags : ["film"] });
  }
  return out;
}

/**
 * Get ranked recommendations in three buckets.
 * Input:  { artists, films, city, vibe, entities }
 * Returns: { dining: [Rec], events: [Rec], trips: [Rec], profile, source }
 * Rec = { name, category, score (0-1), why, area?, priceHint?, tags? }
 */
export async function getRecommendations({ artists = [], films = [], city = "Lagos", vibe = "", entities = [] }, env = {}) {
  const profile = deriveProfile(artists, films);
  // Fold any live entity tags (from /search) into the displayed profile.
  for (const e of entities || []) {
    for (const t of e?.tags || []) if (!profile.tags.includes(t)) profile.tags.push(t);
  }
  const seedNames = [...artists, ...films].filter(Boolean);
  const anchor = seedNames[0] || "your taste";
  const secondary = seedNames[1] || anchor;
  const tagLine = profile.tags.slice(0, 3).join(", ");
  const cuisine = profile.cuisines[0] || "modern seasonal";
  const cuisine2 = profile.cuisines[1] || cuisine;

  const live = await liveRecommendations({ city, entities }, env);
  if (live) {
    return { ...live, profile, source: "qloo" };
  }

  // ---- MOCK recommendations (deterministic, taste-aware) -------------------
  const dining = [
    {
      name: `${titleCase(cuisine)} Kitchen — ${city}`,
      category: titleCase(cuisine) + " restaurant",
      score: 0.94,
      why: `Because you love ${anchor} — Qloo's taste graph links that ${tagLine} profile to ${cuisine} dining; this is its highest-affinity match in ${city}.`,
      area: city,
      priceHint: "$$",
      tags: [titleCase(cuisine), "Restaurant"],
    },
    {
      name: `The ${titleCase(profile.tags[0] || "eclectic")} Table`,
      category: titleCase(cuisine2) + " / small plates",
      score: 0.88,
      why: `Fans of ${secondary} over-index on ${cuisine2} spots with a ${profile.mood} atmosphere — exactly this room's profile.`,
      area: city,
      priceHint: "$$",
      tags: [titleCase(cuisine2), "Small plates"],
    },
    {
      name: "Late-Night Listening Bar & Grill",
      category: "Listening bar / grill",
      score: 0.82,
      why: `Your picks share a ${profile.mood} mood; Qloo maps that mood to vinyl listening bars where the playlist is curated like a setlist.`,
      area: city,
      priceHint: "$$",
      tags: ["Listening bar", "Grill"],
    },
  ];

  const events = [
    {
      name: `Live: ${titleCase(profile.tags[0] || "Eclectic")} Sessions`,
      category: "Live music / experience",
      score: 0.92,
      why: `Direct taste adjacency — audiences for ${anchor} are Qloo's strongest predictor for this kind of ${tagLine} live night.`,
      area: city,
      priceHint: "$$",
      tags: ["Live music", "Venue"],
    },
    {
      name: "Cult Film + Director's Cut Screening",
      category: "Cinema experience",
      score: 0.86,
      why: `Your film taste (${films.join(", ") || "eclectic cinema"}) clusters with repertory screenings and post-film discussions in Qloo's graph.`,
      area: city,
      priceHint: "$",
      tags: ["Cinema", "Screening"],
    },
    {
      name: "Taste-Makers Market & Pop-Up",
      category: "Pop-up / market",
      score: 0.79,
      why: `A discovery pick: people with your ${tagLine} profile rate pop-ups and maker markets far above average${vibe ? ` — fits your "${vibe}" vibe` : ""}.`,
      area: city,
      priceHint: "$",
      tags: ["Pop-up", "Market"],
    },
  ];

  const trips = [
    {
      name: `${city} Taste Weekender (2 days)`,
      category: "Weekend itinerary",
      score: 0.91,
      why: `Built around your profile end-to-end: ${cuisine} dinners, a ${tagLine} live night, and a film-location walk — sequenced by Qloo affinity, not generic top-10 lists.`,
      area: city,
      priceHint: "$$",
      tags: ["Weekend", "Itinerary"],
    },
    {
      name: "Follow the Sound: Music-Pilgrimage Day Trip",
      category: "Day trip",
      score: 0.84,
      why: `Because ${anchor} anchors your taste, Qloo surfaces the studios, record shops and venues culturally closest to that sound near ${city}.`,
      area: city,
      priceHint: "$",
      tags: ["Day trip", "Music"],
    },
    {
      name: "Next City to Try: Taste-Twin Destination",
      category: "Trip idea",
      score: 0.78,
      why: `Qloo's taste twins — people who love ${secondary} like you do — rate this destination's food-and-film scene highest. A stretch pick for your next trip.`,
      area: "Taste-twin city",
      priceHint: "$$$",
      tags: ["Destination", "Taste twin"],
    },
  ];

  return { dining, events, trips, profile, source: "mock" };
}

function titleCase(s) {
  return String(s || "")
    .split(/[\s-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export { deriveProfile };
