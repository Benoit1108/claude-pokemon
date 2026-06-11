// Statusline tick (Phase R3d-3) — ported from pokemon_tick (lib/lib.sh).
//
// The engine owns ALL tick LOGIC but tires NO randomness itself: every random
// outcome is resolved upstream (bash, with its current RNG) and passed in via
// `decisions`, so the engine is a pure deterministic function of
// (state, data, now, tokens, used_pct, decisions). This makes it fully
// testable: forcing decisions to "nothing" makes the whole tick deterministic
// and byte-diffable against the bash tick. (At R3d-5, when bash is dropped, the
// engine will generate `decisions` itself via Math.random.)
//
// Out of scope here (stay bash until later phases): the auto-submit curl
// (network → R3d-4) and the RNG roll computation itself.
import { levelFromXp } from './xp.js';
import { evoField } from './render/views.js';
import { archiveToTeam, checkBadges } from './collection.js';
function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
function prepend10(list, ev) {
    return [ev, ...(Array.isArray(list) ? list : [])].slice(0, 10);
}
export function tick(input) {
    const { data, now, now_epoch, session_id: sid, current_tokens, decisions } = input;
    const usedPct = input.used_pct == null ? null : Number(input.used_pct);
    const thresholds = data.thresholds ?? [];
    const maxLevel = thresholds.length - 1;
    const s = clone(input.state);
    // ── Schema migration (forward-compat) ──
    s.badges ??= [];
    s.team ??= [];
    s.pc_storage ??= [];
    s.pokedex ??= {};
    s.lifetime_stats ??= {
        total_tokens: 0,
        total_evolutions: 0,
        total_shinies: 0,
        max_level: 0,
        lineages_completed: [],
        total_compagnons: 1,
        first_shiny_at: null,
    };
    const ls = s.lifetime_stats;
    // ── Retroactive backfill (idempotent) ──
    ls.max_level = (ls.max_level ?? 0) > s.current_level ? ls.max_level : s.current_level;
    const linNow = s.lineage ?? '';
    if (linNow !== '' && (s.pokedex[linNow] ?? null) == null) {
        s.pokedex[linNow] = {
            seen: true,
            count: 1,
            first_seen_at: s.created_at,
            shiny_seen: s.is_shiny,
            shiny_count: s.is_shiny ? 1 : 0,
        };
    }
    if (linNow !== '' && s.is_shiny === true && (s.pokedex[linNow]?.shiny_seen ?? false) === false) {
        s.pokedex[linNow].shiny_seen = true;
        s.pokedex[linNow].shiny_count = (s.pokedex[linNow].shiny_count ?? 0) + 1;
    }
    if (s.is_shiny === true && ls.total_shinies === 0) {
        ls.total_shinies = 1;
        ls.first_shiny_at ??= s.created_at;
    }
    // ── Lineage assignment (sticky) ──
    let lineage = s.lineage ?? '';
    if (!lineage) {
        lineage = decisions.starter;
        s.lineage = lineage;
        s.pokedex[lineage] ??= { seen: false, shiny_seen: false, count: 0, shiny_count: 0, first_seen_at: null };
        s.pokedex[lineage].seen = true;
        s.pokedex[lineage].count += 1;
        s.pokedex[lineage].first_seen_at ??= now;
    }
    // ── Clamp current_level DOWN to what total_xp supports (never up here) ──
    const expectedLevel = levelFromXp(thresholds, s.total_xp ?? 0);
    if ((s.current_level ?? 0) > expectedLevel) {
        s.current_level = expectedLevel;
        s.evolution_flash_remaining = 0;
    }
    let isShiny = s.is_shiny;
    const prevLevel = s.current_level;
    // ── Per-tick delta + per-turn credit accumulator ──
    s.sessions ??= {};
    s.sessions[sid] ??= {};
    const sess = s.sessions[sid];
    const prevTokens = sess.last_tick_tokens ?? sess.max_context_tokens ?? 0;
    const rawDelta = current_tokens > prevTokens ? current_tokens - prevTokens : 0;
    let pending = (sess.pending_tokens ?? 0) + rawDelta;
    const lastCreditAt = sess.last_xp_credit_at ?? 0;
    const gapS = now_epoch - lastCreditAt;
    let delta = 0;
    const TICK_CAP = 10000;
    if (gapS >= 30 && pending > 0) {
        delta = pending > TICK_CAP ? TICK_CAP : pending;
        pending -= delta;
        sess.last_xp_credit_at = now_epoch;
    }
    sess.pending_tokens = pending;
    // ── Multipliers ──
    const xpMultiplier = xpMultFor(usedPct);
    const typeMatch = typeMatchFor(lineage, usedPct);
    const today = now.slice(0, 10);
    let dailyMult = 1.0;
    if ((s.last_daily_bonus_date ?? '') !== today) {
        dailyMult = 1.5;
        s.last_daily_bonus_date = today;
    }
    const pctInt = Math.round(usedPct ?? 0);
    if (pctInt >= 90)
        s.high_context_streak = (s.high_context_streak ?? 0) + 1;
    else
        s.high_context_streak = 0;
    let statusMult = 1.0;
    if ((s.high_context_streak ?? 0) >= 5) {
        s.status = 'tired';
        statusMult = 0.75;
    }
    else {
        s.status = 'ok';
        statusMult = 1.0;
    }
    const heldItem = s.held_item ?? '';
    let heldMult = 1.0;
    if (heldItem)
        heldMult = Number(data.items?.[heldItem]?.effect_xp_mult ?? 1.0);
    const injuredTicks = s.injured_ticks_remaining ?? 0;
    let injuredMult = 1.0;
    if (injuredTicks > 0) {
        injuredMult = 0.75;
        s.injured_ticks_remaining = injuredTicks - 1;
        if (heldItem === 'oran_berry') {
            s.held_item = null;
            s.injured_ticks_remaining = 0;
            injuredMult = 1.0;
        }
    }
    const shinyHunter = data.shiny_hunter_mode === true;
    // Season (month/day from `now`)
    const d = new Date(now);
    const curMonth = d.getUTCMonth() + 1;
    const curDay = d.getUTCDate();
    let seasonMult = 1.0;
    for (const season of Object.values(data.seasons ?? {})) {
        if (curMonth === season.month && curDay >= season.day_start && curDay <= season.day_end) {
            seasonMult = Number(season.boost_mult_xp ?? 1.0);
            break;
        }
    }
    let weightedDelta = 0;
    if (!shinyHunter) {
        let m = xpMultiplier * typeMatch * dailyMult * statusMult * heldMult * injuredMult * seasonMult;
        if (m > 2.0)
            m = 2.0;
        weightedDelta = Math.trunc(delta * m);
    }
    // Stored as strings, matching the bash printf values (e.g. "2.0", "0.75").
    s.last_xp_multipliers = {
        context: xpMultiplier.toFixed(1),
        type_match: typeMatch.toFixed(1),
        daily_bonus: dailyMult.toFixed(1),
        status: statusMult === 0.75 ? '0.75' : '1.0',
    };
    // ── Random events (resolved upstream via `decisions`) ──
    if (decisions.berry.fired) {
        const b = data.berries[decisions.berry.index];
        s.total_xp = (s.total_xp ?? 0) + b.xp_bonus;
        s.recent_events = prepend10(s.recent_events, {
            type: 'berry',
            id: b.id,
            name: b.name,
            emoji: b.emoji,
            xp: b.xp_bonus,
            at: now,
        });
    }
    if (decisions.encounter.fired) {
        const w = data.wild_pool[decisions.encounter.index];
        s.pokedex_wild ??= {};
        s.pokedex_wild[w.id] = {
            count: (s.pokedex_wild[w.id]?.count ?? 0) + 1,
            first_seen_at: s.pokedex_wild[w.id]?.first_seen_at ?? now,
            last_seen_at: now,
        };
        s.recent_events = prepend10(s.recent_events, { type: 'encounter', id: w.id, at: now });
        if (decisions.battle.fired) {
            const ownLevel = s.current_level;
            const wildLevel = decisions.battle.wild_level;
            const battleWon = ownLevel >= wildLevel - 3;
            if (battleWon) {
                const bonusXp = Math.trunc((decisions.battle.bonus_xp_raw * wildLevel) / 25);
                s.total_xp = (s.total_xp ?? 0) + bonusXp;
                s.recent_events = prepend10(s.recent_events, {
                    type: 'battle_won',
                    id: w.id,
                    wild_level: wildLevel,
                    xp: bonusXp,
                    at: now,
                });
            }
            else {
                s.injured_ticks_remaining = data.battle_injured_ticks ?? 5;
                s.recent_events = prepend10(s.recent_events, {
                    type: 'battle_lost',
                    id: w.id,
                    wild_level: wildLevel,
                    at: now,
                });
            }
        }
        if (decisions.item.fired) {
            const itemKeys = Object.keys(data.items ?? {});
            const itemId = itemKeys[decisions.item.index];
            s.items ??= {};
            s.items[itemId] = (s.items[itemId] ?? 0) + 1;
            s.recent_events = prepend10(s.recent_events, {
                type: 'item',
                id: itemId,
                name: data.items[itemId]?.name,
                emoji: data.items[itemId]?.emoji,
                at: now,
            });
        }
    }
    // ── Apply credited XP + session bookkeeping + baseline ──
    s.total_xp = (s.total_xp ?? 0) + weightedDelta;
    ls.total_tokens = (ls.total_tokens ?? 0) + rawDelta;
    sess.first_seen ??= now;
    sess.last_seen = now;
    sess.max_context_tokens = (sess.max_context_tokens ?? 0) > current_tokens ? sess.max_context_tokens : current_tokens;
    sess.last_tick_tokens = current_tokens;
    s.last_updated = now;
    if (!sess.baseline) {
        sess.baseline = {
            total_xp: s.total_xp - weightedDelta,
            friendship: s.friendship ?? 0,
            lifetime_tokens: ls.total_tokens - rawDelta,
            lineage: s.lineage,
            current_level: s.current_level,
            evolution_count: (s.evolution_history ?? []).length,
            badge_count: (s.badges ?? []).length,
            pokedex_wild_count: Object.keys(s.pokedex_wild ?? {}).length,
            games_won: ls.games_won ?? 0,
        };
    }
    // ── Level-up / evolution ──
    const totalXp = s.total_xp;
    const newLevel = levelFromXp(thresholds, totalXp);
    if (newLevel > prevLevel) {
        if (prevLevel === 0 && newLevel >= 1) {
            isShiny = decisions.shiny;
            s.is_shiny = isShiny;
            if (isShiny) {
                s.pokedex[lineage].shiny_seen = true;
                s.pokedex[lineage].shiny_count += 1;
                ls.total_shinies += 1;
                ls.first_shiny_at ??= now;
            }
        }
        if (lineage === 'eevee' && prevLevel < 30 && newLevel >= 30) {
            let chosenForm = '';
            let usedStone = '';
            for (const stone of ['fire_stone', 'water_stone', 'thunder_stone']) {
                if ((s.items?.[stone] ?? 0) > 0) {
                    usedStone = stone;
                    chosenForm = data.eevee_evolution_rules[stone];
                    break;
                }
            }
            if (!chosenForm) {
                const friendship = s.friendship ?? 0;
                const threshold = data.eevee_friendship_threshold ?? 50;
                const hour = d.getUTCHours();
                if (friendship >= threshold) {
                    chosenForm =
                        hour >= 6 && hour < 18
                            ? data.eevee_evolution_rules.day_default
                            : data.eevee_evolution_rules.night_default;
                }
                else {
                    const fallback = ['fire_stone', 'water_stone', 'thunder_stone'][decisions.eevee_fallback_index];
                    chosenForm = data.eevee_evolution_rules[fallback];
                }
            }
            s.eevee_form = chosenForm;
            if (usedStone) {
                s.items[usedStone] -= 1;
                if (s.items[usedStone] <= 0)
                    delete s.items[usedStone];
            }
        }
        // Log stage TRANSITIONS in (prevLevel, newLevel]. Eevee L30: log once.
        const stages = data.lineages?.[lineage]?.stages ?? [];
        const transitions = stages
            .filter((st) => st.min_level > prevLevel && st.min_level <= newLevel)
            .map((st) => st.min_level);
        let stageChanged = false;
        let transitionCount = 0;
        let eeveeLogged = false;
        for (const t of transitions) {
            if (lineage === 'eevee' && t === 30 && eeveeLogged)
                continue;
            const evoName = evoField(data, s, lineage, t, 'name');
            s.evolution_history = [
                ...(s.evolution_history ?? []),
                { level: t, name: evoName, evolved_at: now, is_shiny: isShiny },
            ];
            stageChanged = true;
            transitionCount += 1;
            if (lineage === 'eevee' && t === 30)
                eeveeLogged = true;
        }
        if (transitionCount > 0)
            ls.total_evolutions = (ls.total_evolutions ?? 0) + transitionCount;
        ls.max_level = (ls.max_level ?? 0) > newLevel ? ls.max_level : newLevel;
        const flashValue = stageChanged ? 3 : 0;
        s.current_level = newLevel;
        if (flashValue > 0)
            s.evolution_flash_remaining = flashValue;
        // (else: leave evolution_flash_remaining as-is, matching jq)
        if (prevLevel < maxLevel && newLevel >= maxLevel) {
            Object.assign(s, archiveToTeam(s, now));
        }
    }
    else {
        const flash = s.evolution_flash_remaining ?? 0;
        if (flash > 0)
            s.evolution_flash_remaining = flash - 1;
    }
    // ── Per-tick counters ──
    s.animation_frame_index = (s.animation_frame_index ?? 0) + 1;
    if (lineage && lineage !== 'null')
        s.friendship = (s.friendship ?? 0) + 1;
    // ── Badges ──
    Object.assign(s, checkBadges(s, now, data));
    // ── Session cleanup (drop sessions older than 30 days, keep current) ──
    const cutoff = new Date(now_epoch * 1000 - 30 * 86400 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const kept = {};
    for (const [k, v] of Object.entries(s.sessions)) {
        if (k === sid || (v.last_seen ?? '') >= cutoff)
            kept[k] = v;
    }
    s.sessions = kept;
    return { state: s };
}
// xpMultiplier / typeMatchMultiplier inline (Math.round matches bash printf %.0f
// for the integer used_pct values the statusline supplies).
function xpMultFor(usedPct) {
    if (usedPct == null)
        return 1.0;
    const p = Math.round(usedPct);
    if (p <= 25)
        return 2.0;
    if (p <= 50)
        return 1.5;
    if (p <= 75)
        return 1.0;
    return 0.5;
}
function typeMatchFor(lineage, usedPct) {
    const p = Math.round(usedPct ?? 50);
    switch (lineage) {
        case 'fire':
            return p < 30 ? 1.2 : 1.0;
        case 'water':
            return p > 70 ? 1.2 : 1.0;
        case 'grass':
            return p >= 40 && p <= 60 ? 1.2 : 1.0;
        case 'electric':
            return 1.2;
        case 'eevee':
            return 1.1;
        default:
            return 1.0;
    }
}
//# sourceMappingURL=tick.js.map