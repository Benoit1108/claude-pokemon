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
//# sourceMappingURL=views.js.map