// CLI view renderers ported from lib/pokemon-status.sh (Phase R3c). Each
// function reproduces the bash view's `printf` sequence byte-for-byte (verified
// against the R3a fixtures, ANSI-stripped). Colors are cosmetic here — the
// fixtures strip ANSI, so only visible text + spacing must match.
//
// This slice: the box-free list views (badges, inventory, team, pc). Boxed
// views (stats, main, recap, trainer-card) + the pokedex grid come next.
import { bashPrintf } from './printf.js';
import { t } from './i18n.js';
// ANSI (mirrors lib/pokemon-status.sh). Stripped by the parity test; kept so the
// eventual bash-free entrypoint (R3d) renders in colour.
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[33m'; // theme accent placeholder (pokemon_theme_accent)
// jq string interpolation renders null/absent as the literal "null".
function jqStr(v) {
    return v === null || v === undefined ? 'null' : String(v);
}
// pokemon_t_pad pads by CHARACTER count (wc -m), unlike bashPrintf's %-Ns which
// pads by bytes. Code-point count matches `wc -m` for these locale strings.
function padChars(s, width) {
    const len = [...s].length;
    return s + ' '.repeat(Math.max(0, width - len));
}
function tPad(locale, key, width) {
    return padChars(t(locale, key), width);
}
// fmt_int: group digits in 3s with a SPACE separator (matches the awk version).
function fmtInt(n) {
    let s = String(Math.trunc(Number(n) || 0));
    let neg = '';
    if (s.startsWith('-')) {
        neg = '-';
        s = s.slice(1);
    }
    let out = '';
    while (s.length > 3) {
        out = ' ' + s.slice(-3) + out;
        s = s.slice(0, -3);
    }
    return neg + s + out;
}
// ── badges ───────────────────────────────────────────────────────────────────
const BADGE_EMOJI = {
    hatch: '🥚',
    first_evolution: '🌱',
    first_shiny: '⭐',
    champion: '🏆',
    centurion: '💯',
    constellation: '🌌',
    master_pokedex: '💎',
    dex_50: '🔬',
    dex_100: '📚',
    regional_kanto: '🏔️',
    regional_johto: '🏯',
    master_fire: '🔥',
    master_water: '💧',
    master_grass: '🌿',
    master_electric: '⚡',
    master_eevee: '🦊',
    master_chikorita: '🍃',
    master_cyndaquil: '🦔',
    master_totodile: '🐊',
};
// Exact display order from view_badges (note: dex_50/dex_100/regional_* are NOT
// listed in the bash view, so they are intentionally omitted here too).
const BADGE_ORDER = [
    'hatch',
    'first_evolution',
    'first_shiny',
    'champion',
    'centurion',
    'constellation',
    'master_pokedex',
    'master_fire',
    'master_water',
    'master_grass',
    'master_electric',
    'master_eevee',
    'master_chikorita',
    'master_cyndaquil',
    'master_totodile',
];
export function renderBadges(ctx) {
    const { state, locale } = ctx;
    let out = bashPrintf(`\n  %s%s${t(locale, 'badges.title')}%s\n\n`, BOLD, GOLD, RESET);
    const badges = Array.isArray(state.badges) ? state.badges : [];
    for (const id of BADGE_ORDER) {
        const earnedAt = badges.find((b) => b && b.id === id)?.earned_at ?? '';
        const emoji = BADGE_EMOJI[id] ?? '?';
        const label = t(locale, `badges.${id}.0`);
        const desc = t(locale, `badges.${id}.1`);
        if (earnedAt) {
            out += bashPrintf('   %s  %s%-22s%s  %s%s%s\n     %s%s%s\n', emoji, BOLD, label, RESET, GOLD, String(earnedAt).slice(0, 10), RESET, DIM, desc, RESET);
        }
        else {
            out += bashPrintf('   %s%s  %-22s%s\n     %s%s%s\n', DIM, '▢', label, RESET, DIM, desc, RESET);
        }
    }
    out += '\n';
    return out;
}
// ── inventory ──────────────────────────────────────────────────────────────────
export function renderInventory(ctx) {
    const { state, data, locale } = ctx;
    let out = bashPrintf(`\n  %s%s${t(locale, 'inventory.title')}%s\n\n`, BOLD, GOLD, RESET);
    const items = state.items && typeof state.items === 'object' ? state.items : {};
    const entries = Object.entries(items);
    if (entries.length === 0) {
        out += bashPrintf(`  %s${t(locale, 'inventory.empty')}%s\n\n`, DIM, RESET);
    }
    else {
        for (const [itemId, qty] of entries) {
            const meta = data.items?.[itemId];
            const name = meta?.name ?? itemId;
            const emoji = meta?.emoji ?? '?';
            const desc = meta?.desc ?? '';
            out += bashPrintf('   %s  %s%-18s%s  %s×%d%s\n     %s%s%s\n', emoji, BOLD, name, RESET, DIM, Number(qty), RESET, DIM, desc, RESET);
        }
        out += '\n';
    }
    const eeveeForm = state.eevee_form ?? '';
    if (eeveeForm) {
        const stages = data.lineages?.eevee?.stages ?? [];
        const formName = stages.find((s) => s && s.showdown_id === eeveeForm)?.name;
        const msg = t(locale, 'inventory.eevee_form', formName);
        out += bashPrintf('  %s%s%s\n\n', DIM, msg, RESET);
    }
    return out;
}
// ── roster (team / pc) ─────────────────────────────────────────────────────────
function renderRoster(ctx, field, title) {
    const { state, data } = ctx;
    let out = bashPrintf('\n  %s%s%s%s\n\n', BOLD, GOLD, title, RESET);
    const list = Array.isArray(state[field]) ? state[field] : [];
    if (list.length === 0) {
        out += bashPrintf(`  %s${t(ctx.locale, 'team.empty')}%s\n\n`, DIM, RESET);
        return out;
    }
    let i = 0;
    for (const e of list) {
        const lin = jqStr(e.lineage);
        const star = e.is_shiny === true ? `${GOLD}★${RESET} ` : '';
        const name = jqStr(e.max_stage);
        const lvl = Number(e.level);
        const label = data.lineages?.[lin]?.label ?? lin;
        const created = jqStr(e.created_at).slice(0, 10);
        const completed = jqStr(e.completed_at).slice(0, 10);
        out += bashPrintf('   %s[%d]%s  %s%-22s  %sLv.%d%s  %s%s%s  (%s%s%s → %s%s%s)\n', BOLD, i, RESET, star, name, BOLD, lvl, RESET, DIM, label, RESET, DIM, created, RESET, DIM, completed, RESET);
        i++;
    }
    out += '\n';
    return out;
}
export function renderTeam(ctx) {
    let out = renderRoster(ctx, 'team', t(ctx.locale, 'team.title'));
    const pcCount = Array.isArray(ctx.state.pc_storage) ? ctx.state.pc_storage.length : 0;
    if (pcCount > 0) {
        // The "bancale" line: 6 conversions, 5 args → trailing %s is empty (bash
        // reuses the format-with-missing-arg). Frozen exactly by the R3a fixture.
        out += bashPrintf(`  %s${t(ctx.locale, 'team.pc_overflow')} — %sbash %s pc%s\n\n`, DIM, pcCount, DIM, ctx.scriptName, RESET);
    }
    return out;
}
export function renderPc(ctx) {
    return renderRoster(ctx, 'pc_storage', t(ctx.locale, 'pc.title'));
}
// ── stats ──────────────────────────────────────────────────────────────────────
export function renderStats(ctx) {
    const { state, data, locale } = ctx;
    const ls = state.lifetime_stats ?? {};
    let out = bashPrintf(`\n  %s%s${t(locale, 'stats.title')}%s\n\n`, BOLD, GOLD, RESET);
    const shinies = Number(ls.total_shinies ?? 0);
    const completed = Array.isArray(ls.lineages_completed) ? ls.lineages_completed.length : 0;
    const totalLineages = Object.keys(data.lineages ?? {}).length;
    const firstShiny = ls.first_shiny_at ?? '—';
    out += bashPrintf(`  %s${tPad(locale, 'stats.total_tokens', 22)}%s :  %s\n`, DIM, RESET, fmtInt(ls.total_tokens));
    out += bashPrintf(`  %s${tPad(locale, 'stats.total_evolutions', 22)}%s :  %s\n`, DIM, RESET, fmtInt(ls.total_evolutions));
    out += bashPrintf(`  %s${tPad(locale, 'stats.total_shinies', 22)}%s :  %s\n`, DIM, RESET, fmtInt(shinies));
    out += bashPrintf(`  %s${tPad(locale, 'stats.max_level', 22)}%s :  Lv.%s\n`, DIM, RESET, jqStr(ls.max_level));
    out += bashPrintf(`  %s${tPad(locale, 'stats.total_compagnons', 22)}%s :  %s\n`, DIM, RESET, fmtInt(ls.total_compagnons));
    out += bashPrintf(`  %s${tPad(locale, 'stats.lineages_completed', 22)}%s :  %s / %s\n`, DIM, RESET, completed, totalLineages);
    out += bashPrintf(`  %s${tPad(locale, 'stats.first_shiny', 22)}%s :  %s\n\n`, DIM, RESET, String(firstShiny).slice(0, 10));
    const mults = state.last_xp_multipliers;
    if (mults != null) {
        out += bashPrintf(`  %s%s${t(locale, 'stats.multipliers_title')}%s\n\n`, BOLD, GOLD, RESET);
        const ctxM = mults.context;
        const tm = mults.type_match;
        const db = mults.daily_bonus;
        const st = mults.status;
        out += bashPrintf(`  %s${tPad(locale, 'stats.context', 22)}%s : ×%s\n`, DIM, RESET, ctxM);
        out += bashPrintf(`  %s${tPad(locale, 'stats.type_match', 22)}%s : ×%s\n`, DIM, RESET, tm);
        out += bashPrintf(`  %s${tPad(locale, 'stats.daily_bonus', 22)}%s : ×%s\n`, DIM, RESET, db);
        out += bashPrintf(`  %s${tPad(locale, 'stats.status', 22)}%s : ×%s\n`, DIM, RESET, st);
        const combined = (Number(ctxM) * Number(tm) * Number(db) * Number(st)).toFixed(2);
        out += bashPrintf(`  %s${tPad(locale, 'stats.combined', 22)}%s : %s×%s%s\n\n`, DIM, RESET, BOLD, combined, RESET);
    }
    const status = state.status ?? 'ok';
    const streak = Number(state.high_context_streak ?? 0);
    if (status === 'tired') {
        out += bashPrintf(`  %s${t(locale, 'stats.tired_warning', streak)}%s\n\n`, BOLD, RESET);
    }
    if (shinies > 0) {
        out += bashPrintf(`  %s${t(locale, 'stats.shiny_charm')}%s\n\n`, GOLD, RESET);
    }
    return out;
}
// ── pokedex ──────────────────────────────────────────────────────────────────────
export function renderPokedex(ctx) {
    const { state, data, locale } = ctx;
    let out = bashPrintf(`\n  %s%s${t(locale, 'pokedex.title_lineages')}%s\n\n`, BOLD, GOLD, RESET);
    const dex = state.pokedex ?? {};
    for (const [lin, info] of Object.entries(data.lineages ?? {})) {
        const label = info.label;
        const entry = dex[lin] ?? {};
        const seen = entry.seen ?? false;
        const shiny = entry.shiny_seen ?? false;
        const count = Number(entry.count ?? 0);
        const shinyCount = Number(entry.shiny_count ?? 0);
        if (seen === true) {
            const shinyStr = shiny === true ? `  ${GOLD}${t(locale, 'pokedex.shiny_seen')}${RESET}` : '';
            out += bashPrintf('   %s✓%s  %-20s %s×%d   %s: %d%s\n', BOLD, RESET, label, DIM, count, t(locale, 'pokedex.shinies'), shinyCount, shinyStr);
        }
        else {
            out += bashPrintf('   ▢  %s%-20s%s  %s—%s\n', DIM, label, RESET, DIM, RESET);
        }
    }
    // Wild encounters — language comes from data.json (as in the bash view).
    const wild = state.pokedex_wild ?? {};
    const wildSeen = Object.keys(wild).length;
    const pool = Array.isArray(data.wild_pool) ? data.wild_pool : [];
    const totalWild = pool.length;
    const lang = data.language ?? 'fr';
    out += bashPrintf(`\n  %s%s${t(locale, 'pokedex.title_wild')}%s   %s(%d / %d)%s\n\n`, BOLD, GOLD, RESET, DIM, wildSeen, totalWild, RESET);
    const sorted = [...pool].sort((a, b) => Number(a.national_dex) - Number(b.national_dex));
    let col = 0;
    for (const w of sorted) {
        const id = w.id;
        const seen = Object.prototype.hasOwnProperty.call(wild, id);
        const marker = seen ? `${BOLD}✓${RESET}` : `${DIM}▢${RESET}`;
        const style = seen ? '' : DIM;
        const nameDisp = seen ? jqStr(w[`name_${lang}`]) : '???';
        const rarity = w.rarity ?? 'common';
        const rarityMarker = rarity === 'legendary' ? `${GOLD}★${RESET}` : ' ';
        // The wild-grid name field is padded by AWK %-12s (lib/pokemon-status.sh),
        // which counts CHARACTERS in a UTF-8 locale — unlike bash printf's byte
        // %-Ns. So pre-pad by char count, then emit with a plain %s.
        out += bashPrintf('  %s #%03d %s %s%s%s', marker, Number(w.national_dex), rarityMarker, style, padChars(nameDisp, 12), RESET);
        col++;
        if (col >= 4) {
            out += '\n';
            col = 0;
        }
    }
    if (col > 0)
        out += '\n';
    out += '\n';
    return out;
}
//# sourceMappingURL=views.js.map