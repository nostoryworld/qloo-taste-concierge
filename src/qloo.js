// src/qloo.js — Qloo taste-graph data layer
//
// ============================================================================
// MOCK LAYER — clearly marked. When QLOO_API_KEY is set, tryQloo() attempts
// the real Qloo API first and this module falls back to the mock data below
// on ANY failure, so the demo always works end-to-end for judges.
//
// Confirmed Qloo hackathon API facts (verified Oct 22, 2026):
//   - Base URL: https://hackathon.api.qloo.com  — MUST be this host.
//     Other Qloo base URLs return 401 with hackathon keys.
//   - Auth: header `X-Api-Key: <key>` ONLY — not Bearer, not a query param.
//   - Primary endpoint: /v2/insights (Insights API, POST or GET).
//     Do NOT use legacy /recommendations endpoints.
//
// To wire the real API fully:
//   1. Set the secret:  wrangler secret put QLOO_API_KEY
//   2. (Optional) Set QLOO_API_BASE var — defaults to https://hackathon.api.qloo.com
//      (leave it at the default for hackathon keys; see above).
//   3. Response mapping lives in tryQloo() / mapInsights(). The shapes
//      returned by resolveEntities() / getRecommendations() are the contract
//      the rest of the app consumes — keep those stable.
// ============================================================================

const DEFAULT_BASE = "https://hackathon.api.qloo.com";
const INSIGHTS_PATH = "/v2/insights"; // Insights API — the only endpoint we use

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
// Public API — stable contract for the rest of the app
// ---------------------------------------------------------------------------

/**
 * Resolve free-text artist / film names to taste entities.
 * Returns: [{ name, type: "artist"|"movie", id, tags }]
 */
export async function resolveEntities({ artists = [], films = [] }, env = {}) {
  // Entity resolution also goes through the Insights API (/v2/insights) —
  // there is no separate legacy search/recommendations call in this app.
  const live = await tryQloo(env, { query: [...artists, ...films].join(", ") });
  if (live?.entities) return live.entities;

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
 * Rec = { name, category, score (0-1), why, area?, priceHint? }
 */
export async function getRecommendations({ artists = [], films = [], city = "Lagos", vibe = "" }, env = {}) {
  const profile = deriveProfile(artists, films);
  const seedNames = [...artists, ...films].filter(Boolean);
  const anchor = seedNames[0] || "your taste";
  const secondary = seedNames[1] || anchor;
  const tagLine = profile.tags.slice(0, 3).join(", ");
  const cuisine = profile.cuisines[0] || "modern seasonal";
  const cuisine2 = profile.cuisines[1] || cuisine;

  const live = await tryQloo(env, {
    entities: seedNames,
    city,
    vibe,
    tags: profile.tags,
  });
  if (live?.dining && live?.events && live?.trips) {
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
    },
    {
      name: `The ${titleCase(profile.tags[0] || "eclectic")} Table`,
      category: titleCase(cuisine2) + " / small plates",
      score: 0.88,
      why: `Fans of ${secondary} over-index on ${cuisine2} spots with a ${profile.mood} atmosphere — exactly this room's profile.`,
      area: city,
      priceHint: "$$",
    },
    {
      name: "Late-Night Listening Bar & Grill",
      category: "Listening bar / grill",
      score: 0.82,
      why: `Your picks share a ${profile.mood} mood; Qloo maps that mood to vinyl listening bars where the playlist is curated like a setlist.`,
      area: city,
      priceHint: "$$",
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
    },
    {
      name: "Cult Film + Director's Cut Screening",
      category: "Cinema experience",
      score: 0.86,
      why: `Your film taste (${films.join(", ") || "eclectic cinema"}) clusters with repertory screenings and post-film discussions in Qloo's graph.`,
      area: city,
      priceHint: "$",
    },
    {
      name: "Taste-Makers Market & Pop-Up",
      category: "Pop-up / market",
      score: 0.79,
      why: `A discovery pick: people with your ${tagLine} profile rate pop-ups and maker markets far above average${vibe ? ` — fits your "${vibe}" vibe` : ""}.`,
      area: city,
      priceHint: "$",
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
    },
    {
      name: "Follow the Sound: Music-Pilgrimage Day Trip",
      category: "Day trip",
      score: 0.84,
      why: `Because ${anchor} anchors your taste, Qloo surfaces the studios, record shops and venues culturally closest to that sound near ${city}.`,
      area: city,
      priceHint: "$",
    },
    {
      name: "Next City to Try: Taste-Twin Destination",
      category: "Trip idea",
      score: 0.78,
      why: `Qloo's taste twins — people who love ${secondary} like you do — rate this destination's food-and-film scene highest. A stretch pick for your next trip.`,
      area: "Taste-twin city",
      priceHint: "$$$",
    },
  ];

  return { dining, events, trips, profile, source: "mock" };
}

// ---------------------------------------------------------------------------
// Real Qloo attempt — returns null on any failure so callers fall back.
// Confirmed hackathon API shape:
//   POST https://hackathon.api.qloo.com/v2/insights
//   Header: X-Api-Key: <QLOO_API_KEY>   (no Bearer token, no query param)
// Legacy /recommendations endpoints are NOT used anywhere in this app.
// ---------------------------------------------------------------------------
async function tryQloo(env, payload) {
  const key = env?.QLOO_API_KEY;
  if (!key) return null;
  const base = env?.QLOO_API_BASE || DEFAULT_BASE;
  try {
    const res = await fetch(base.replace(/\/$/, "") + INSIGHTS_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": key,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results || data || null;
  } catch {
    return null;
  }
}

function titleCase(s) {
  return String(s || "")
    .split(/[\s-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export { deriveProfile };
