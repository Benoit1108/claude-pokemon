// claude-pokemon-api — Cloudflare Worker for shared anonymous stats.
// Endpoints :
//   POST /v1/submit          submit stats payload (rate-limited 24h per anon_id)
//   GET  /v1/leaderboard     top N players by metric
//   GET  /v1/aggregate       global aggregate stats
//   DELETE /v1/forget        purge anon_id's data (RGPD right-to-delete)
//   GET  /v1/health          healthcheck
//
// Privacy stance :
//   - We do NOT log or store IPs (cf-connecting-ip stripped in code).
//   - We do NOT enable Workers Logs (set in CF dashboard).
//   - anon_id is a client-generated 8-16 hex string, no link to identity.
//   - Strict whitelist on submit payload — extra fields are rejected.

const SCHEMA_VERSION = 1;
const SUBMIT_COOLDOWN_S = 24 * 60 * 60;     // 24h between submits per anon_id
const ANON_ID_RE = /^[a-f0-9]{8,16}$/;
const ALLOWED_LINEAGES = new Set([
  "fire", "water", "grass", "electric", "eevee",
  "chikorita", "cyndaquil", "totodile",
]);
const ALLOWED_BADGES = new Set([
  "hatch", "first_evolution", "first_shiny", "champion", "centurion",
  "constellation", "master_pokedex", "master_fire", "master_water",
  "master_grass", "master_electric", "master_eevee",
  "master_chikorita", "master_cyndaquil", "master_totodile",
]);
const LEADERBOARD_METRICS = new Set([
  "total_tokens", "total_evolutions", "total_shinies", "max_level",
  "lineages_completed_count", "badges_count", "games_won", "pokedex_seen_count",
]);

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

// ── Validation ───────────────────────────────────────────────────────────────
function validateSubmit(body) {
  const errs = [];
  if (!body || typeof body !== "object") return ["body must be object"];

  if (typeof body.anon_id !== "string" || !ANON_ID_RE.test(body.anon_id)) {
    errs.push("anon_id must match /^[a-f0-9]{8,16}$/");
  }
  if (body.schema_version !== SCHEMA_VERSION) {
    errs.push(`schema_version must be ${SCHEMA_VERSION} (got ${body.schema_version})`);
  }
  if (typeof body.client_version !== "string" || body.client_version.length > 32) {
    errs.push("client_version must be string ≤32 chars");
  }
  if (typeof body.submitted_at !== "string") {
    errs.push("submitted_at must be ISO timestamp string");
  }

  const s = body.stats;
  if (!s || typeof s !== "object") return errs.concat("stats missing or not object");

  // lifetime block
  const lt = s.lifetime;
  if (!lt || typeof lt !== "object") {
    errs.push("stats.lifetime missing");
  } else {
    for (const k of [
      "total_tokens", "total_evolutions", "total_shinies", "max_level",
      "total_compagnons", "games_won", "games_played",
    ]) {
      if (typeof lt[k] !== "number" || lt[k] < 0 || lt[k] > 1e15) {
        errs.push(`stats.lifetime.${k} must be non-negative number`);
      }
    }
    if (!Array.isArray(lt.lineages_completed)) {
      errs.push("stats.lifetime.lineages_completed must be array");
    } else {
      for (const lin of lt.lineages_completed) {
        if (!ALLOWED_LINEAGES.has(lin)) errs.push(`unknown lineage: ${lin}`);
      }
    }
  }

  // active block
  const a = s.active;
  if (!a || typeof a !== "object") {
    errs.push("stats.active missing");
  } else {
    if (a.lineage !== null && !ALLOWED_LINEAGES.has(a.lineage)) {
      errs.push(`unknown active.lineage: ${a.lineage}`);
    }
    if (typeof a.current_level !== "number" || a.current_level < 0 || a.current_level > 100) {
      errs.push("active.current_level must be 0-100");
    }
    if (typeof a.is_shiny !== "boolean") {
      errs.push("active.is_shiny must be boolean");
    }
  }

  // badges
  if (!Array.isArray(s.badges)) {
    errs.push("stats.badges must be array");
  } else {
    for (const b of s.badges) {
      if (!ALLOWED_BADGES.has(b)) errs.push(`unknown badge: ${b}`);
    }
  }

  if (typeof s.pokedex_seen_count !== "number" || s.pokedex_seen_count < 0) {
    errs.push("stats.pokedex_seen_count must be non-negative number");
  }

  return errs;
}

// ── Handlers ─────────────────────────────────────────────────────────────────
async function handleSubmit(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: "invalid_json" }, 400); }

  const errs = validateSubmit(body);
  if (errs.length) return jsonResp({ error: "validation", details: errs }, 400);

  const { anon_id } = body;

  // Rate limit : reject if cooldown still active
  const cooldownKey = `cooldown:${anon_id}`;
  const lastSubmit = await env.STATS.get(cooldownKey);
  if (lastSubmit) {
    const secsLeft = Math.ceil(SUBMIT_COOLDOWN_S - (Date.now() / 1000 - parseInt(lastSubmit)));
    return jsonResp({
      error: "rate_limited",
      cooldown_remaining_s: Math.max(0, secsLeft),
    }, 429);
  }

  // Persist (overwrite by anon_id — pseudo-idempotent)
  const record = {
    anon_id,
    schema_version: body.schema_version,
    client_version: body.client_version,
    submitted_at: body.submitted_at,
    stats: body.stats,
  };
  await env.STATS.put(`stats:${anon_id}`, JSON.stringify(record));
  await env.STATS.put(cooldownKey, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: SUBMIT_COOLDOWN_S,
  });

  return jsonResp({ ok: true, next_submit_in_s: SUBMIT_COOLDOWN_S });
}

async function listAllStats(env) {
  // KV list paginated. For MVP: assume <1000 records, single page suffices.
  // Beyond ~1000 entries we'd need pagination + cache.
  const list = await env.STATS.list({ prefix: "stats:" });
  const records = [];
  for (const key of list.keys) {
    const raw = await env.STATS.get(key.name);
    if (raw) {
      try { records.push(JSON.parse(raw)); } catch { /* skip corrupt */ }
    }
  }
  return records;
}

function metricFromRecord(r, metric) {
  const lt = r.stats.lifetime;
  switch (metric) {
    case "total_tokens":             return lt.total_tokens;
    case "total_evolutions":         return lt.total_evolutions;
    case "total_shinies":            return lt.total_shinies;
    case "max_level":                return lt.max_level;
    case "lineages_completed_count": return (lt.lineages_completed || []).length;
    case "badges_count":             return (r.stats.badges || []).length;
    case "games_won":                return lt.games_won || 0;
    case "pokedex_seen_count":       return r.stats.pokedex_seen_count || 0;
    default:                         return 0;
  }
}

async function handleLeaderboard(url, env) {
  const metric = url.searchParams.get("metric") || "total_tokens";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 100);

  if (!LEADERBOARD_METRICS.has(metric)) {
    return jsonResp({ error: "unknown_metric", allowed: [...LEADERBOARD_METRICS] }, 400);
  }

  const records = await listAllStats(env);
  const ranked = records
    .map(r => ({
      anon_id: r.anon_id,
      value: metricFromRecord(r, metric),
      lineage: r.stats.active.lineage,
      level: r.stats.active.current_level,
      is_shiny: r.stats.active.is_shiny,
      submitted_at: r.submitted_at,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  return jsonResp({ metric, total_players: records.length, top: ranked });
}

async function handleAggregate(env) {
  const records = await listAllStats(env);
  if (records.length === 0) {
    return jsonResp({ total_players: 0 });
  }

  let totalTokens = 0, totalShinies = 0, totalCompagnons = 0;
  const starterDist = {};
  for (const r of records) {
    const lt = r.stats.lifetime;
    totalTokens += lt.total_tokens;
    totalShinies += lt.total_shinies;
    totalCompagnons += lt.total_compagnons || 0;
    const lin = r.stats.active.lineage;
    if (lin) starterDist[lin] = (starterDist[lin] || 0) + 1;
  }

  return jsonResp({
    total_players: records.length,
    total_tokens_combined: totalTokens,
    total_shinies_observed: totalShinies,
    shiny_rate_observed: totalCompagnons > 0
      ? +(totalShinies / totalCompagnons).toFixed(5)
      : null,
    active_lineage_distribution: starterDist,
  });
}

async function handleForget(url, env) {
  const anon_id = url.searchParams.get("anon_id");
  if (!anon_id || !ANON_ID_RE.test(anon_id)) {
    return jsonResp({ error: "invalid_anon_id" }, 400);
  }
  await env.STATS.delete(`stats:${anon_id}`);
  await env.STATS.delete(`cooldown:${anon_id}`);
  return jsonResp({ ok: true, forgotten: anon_id });
}

// ── Router ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/v1/health") {
        return jsonResp({ status: "ok", schema_version: SCHEMA_VERSION });
      }
      if (url.pathname === "/v1/submit" && request.method === "POST") {
        return await handleSubmit(request, env);
      }
      if (url.pathname === "/v1/leaderboard" && request.method === "GET") {
        return await handleLeaderboard(url, env);
      }
      if (url.pathname === "/v1/aggregate" && request.method === "GET") {
        return await handleAggregate(env);
      }
      if (url.pathname === "/v1/forget" && request.method === "DELETE") {
        return await handleForget(url, env);
      }
      return jsonResp({ error: "not_found", path: url.pathname }, 404);
    } catch (err) {
      return jsonResp({ error: "internal", message: err.message }, 500);
    }
  },
};
