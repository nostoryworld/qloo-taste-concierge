// src/index.js — Qloo Taste Concierge (Cloudflare Worker, no framework)
// Serves the single-page front end + POST /api/concierge + GET /api/health
import { resolveEntities, getRecommendations } from "./qloo.js";

const HTML = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taste Concierge — powered by Qloo</title>
<style>
  :root{--bg:#0f0e17;--card:#1a1930;--ink:#fffffe;--muted:#a7a9be;--accent:#ff8906;--accent2:#e53170}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
  main{max-width:880px;margin:0 auto;padding:32px 20px 64px}
  h1{font-size:2rem;margin:.2em 0} h2{margin-top:36px} .sub{color:var(--muted)}
  form{background:var(--card);padding:20px;border-radius:14px;display:grid;gap:12px}
  label{font-size:.9rem;color:var(--muted)} input,select{width:100%;padding:11px;border-radius:8px;border:1px solid #333;background:#121126;color:var(--ink)}
  button{background:var(--accent);color:#111;border:0;padding:13px 18px;border-radius:10px;font-weight:700;cursor:pointer;font-size:1rem}
  button:disabled{opacity:.6} .row{display:grid;grid-template-columns:1fr 1fr;gap:12px} @media(max-width:640px){.row{grid-template-columns:1fr}}
  .card{background:var(--card);border-radius:12px;padding:16px;margin:10px 0;border-left:4px solid var(--accent2)}
  .score{float:right;background:var(--accent);color:#111;border-radius:999px;padding:2px 10px;font-weight:700;font-size:.85rem}
  .why{color:var(--muted);font-size:.92rem} .meta{font-size:.85rem;color:var(--muted)} .badge{font-size:.75rem;border:1px solid #444;border-radius:999px;padding:2px 8px;color:var(--muted)}
  #status{min-height:1.2em;color:var(--muted)} footer{margin-top:48px;color:var(--muted);font-size:.85rem}
</style>
</head>
<body>
<main>
  <h1>🎧🍽️ Taste Concierge</h1>
  <p class="sub">Tell us the artists and films you love. Qloo's taste graph (250M+ entities across music, film, dining, fashion and travel) plans your dining, events and trips — matched to <em>your</em> taste, not generic top-10 lists.</p>

  <form id="f">
    <div><label for="artists">Favourite artists (comma-separated)</label>
    <input id="artists" placeholder="Burna Boy, Tems, Kendrick Lamar" value="Burna Boy, Tems"></div>
    <div><label for="films">Favourite films (comma-separated)</label>
    <input id="films" placeholder="Black Panther, Parasite" value="Black Panther"></div>
    <div class="row">
      <div><label for="city">City / context</label>
      <input id="city" value="Lagos"></div>
      <div><label for="vibe">Vibe (optional)</label>
      <select id="vibe"><option value="">Any vibe</option><option>Romantic night</option><option>Big night out</option><option>Chilled weekend</option><option>Family day</option></select></div>
    </div>
    <button id="go" type="submit">Plan my night / trip ✨</button>
    <div id="status"></div>
  </form>

  <div id="out"></div>

  <footer>Built for the Qloo Agentic Hackathon on Devpost. Taste inputs are resolved with Qloo's <code>GET /search</code> and recommendations are powered by the Qloo Insights API (<code>GET /v2/insights</code>); if no API key is configured the demo runs on a clearly-labelled mock taste layer so it always works end-to-end. MIT licence.</footer>
</main>
<script>
const $ = id => document.getElementById(id);
function split(v){return v.split(",").map(s=>s.trim()).filter(Boolean)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function section(title, items){
  if(!items?.length) return "";
  return "<h2>"+title+"</h2>"+items.map(r=>
    '<div class="card"><span class="score">'+Math.round((r.score||0)*100)+'% match</span>'+
    "<strong>"+esc(r.name)+"</strong><div class='meta'>"+esc(r.category||"")+(r.area?" · "+esc(r.area):"")+(r.priceHint?" · "+esc(r.priceHint):"")+"</div>"+
    '<p class="why">💡 Why this matches your taste: '+esc(r.why||"")+"</p></div>").join("");
}
$("f").addEventListener("submit", async e=>{
  e.preventDefault(); $("go").disabled=true; $("status").textContent="Reading your taste profile via Qloo…"; $("out").innerHTML="";
  try{
    const res = await fetch("/api/concierge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      artists:split($("artists").value), films:split($("films").value), city:$("city").value.trim()||"Lagos", vibe:$("vibe").value })});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error||"Request failed");
    $("status").innerHTML = 'Taste profile: <span class="badge">'+esc((data.profile?.tags||[]).join(" · "))+'</span> <span class="badge">source: '+esc(data.source)+'</span>';
    $("out").innerHTML = section("🍽️ Dining", data.dining) + section("🎟️ Events & Experiences", data.events) + section("✈️ Trip Ideas", data.trips);
  }catch(err){ $("status").textContent="Something went wrong: "+err.message; }
  finally{ $("go").disabled=false; }
});
</script>
</body>
</html>`;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "qloo-taste-concierge",
        qloo_base: env.QLOO_API_BASE || "https://hackathon.api.qloo.com",
        qloo_endpoint: "/v2/insights",
        qloo_method: "GET",
        qloo_search_endpoint: "/search",
        qloo_key_configured: Boolean(env.QLOO_API_KEY),
      });
    }

    if (url.pathname === "/api/concierge") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
      const clean = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 12) : []);
      const artists = clean(body.artists);
      const films = clean(body.films);
      if (!artists.length && !films.length) {
        return json({ error: "Give me at least one artist or film you love." }, 400);
      }
      const city = String(body.city || "Lagos").slice(0, 60);
      const vibe = String(body.vibe || "").slice(0, 60);
      const entities = await resolveEntities({ artists, films }, env);
      const recs = await getRecommendations({ artists, films, city, vibe, entities }, env);
      return json({ entities, ...recs });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
};
