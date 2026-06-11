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
// _lineage_emoji (lib/pokemon-status.sh).
const LINEAGE_EMOJI = {
    fire: '🔥',
    water: '💧',
    grass: '🌿',
    electric: '⚡',
    eevee: '🦊',
    chikorita: '🌱',
    cyndaquil: '🦔',
    totodile: '🐊',
};
function lineageEmoji(lineage) {
    return LINEAGE_EMOJI[lineage] ?? '❓';
}
// ── shared helpers for the main view ────────────────────────────────────────────
function stripAnsiStr(s) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}
// pokemon_box_top / pokemon_box_bottom. Title visible length is char-counted
// (wc -m) after stripping ANSI; dashes fill the rest. Titles passed here are
// plain (no ANSI), but we strip to match bash exactly.
function boxTop(title, width) {
    let titleVisible = 0;
    if (title)
        titleVisible = [...stripAnsiStr(title)].length + 2;
    let dashCount = width - titleVisible - 2;
    if (dashCount < 4)
        dashCount = 4;
    const dashes = '─'.repeat(dashCount);
    if (title)
        return `${DIM}╭─ ${BOLD}${title}${RESET} ${dashes}╮${RESET}\n`;
    return `${DIM}╭${dashes}──╮${RESET}\n`;
}
function boxBottom(width) {
    return `${DIM}╰${'─'.repeat(width - 2)}╯${RESET}\n`;
}
// Resolve the active stage by the default rule (highest min_level ≤ level),
// reproducing jq semantics: `min_level <= null` is always FALSE (null is the
// smallest value in jq), unlike JS where null coerces to 0.
export function resolveStageDefault(data, lineage, level) {
    const stages = data.lineages?.[lineage]?.stages ?? [];
    const n = Number(level);
    if (level === null || level === undefined || level === '' || !Number.isFinite(n))
        return null;
    const candidates = stages.filter((s) => s.min_level <= n);
    if (candidates.length === 0)
        return null;
    const maxLvl = Math.max(...candidates.map((s) => s.min_level));
    return stages.find((s) => s.min_level === maxLvl) ?? null;
}
function eeveeFormStage(data, form) {
    const stages = data.lineages?.eevee?.stages ?? [];
    return stages.find((s) => s.showdown_id === form) ?? null;
}
// pokemon_evo_field: Eevee Lv.30+ resolves via state.eevee_form; else default.
export function evoField(data, state, lineage, level, field) {
    const n = Number(level);
    const valid = level !== null && level !== undefined && level !== '' && Number.isFinite(n);
    if (lineage === 'eevee' && valid && n >= 30) {
        const form = state.eevee_form;
        if (form) {
            const st = eeveeFormStage(data, form);
            return jqStr(st ? st[field] : null);
        }
    }
    const st = resolveStageDefault(data, lineage, level);
    return jqStr(st ? st[field] : null);
}
// Resolve a stage field that the bash view reads "eevee-form-first, fallback to
// default if empty" (moves/types/pokedex_entry). Returns the resolved value.
function stageFieldWithFallback(data, state, lineage, level, read) {
    let value = '';
    if (lineage === 'eevee' && level >= 30) {
        const form = state.eevee_form;
        if (form) {
            const st = eeveeFormStage(data, form);
            if (st)
                value = read(st);
        }
    }
    if (value === '') {
        const st = resolveStageDefault(data, lineage, level);
        if (st)
            value = read(st);
    }
    return value;
}
function progressBar(pct, width = 20) {
    let filled = Math.floor((pct * width) / 100);
    if (filled > width)
        filled = width;
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}
function renderRebalanceNotice(ctx, totalXp) {
    if (totalXp < 1000)
        return '';
    if (ctx.state.xp_rebalance_v2_acknowledged === true)
        return '';
    const { locale } = ctx;
    let out = '\n';
    out += boxTop(t(locale, 'main.xp_rebalance_title'), 70);
    out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line1'));
    out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line2'));
    out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line3'));
    out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line4'));
    out += bashPrintf('\n  %s%s%s\n', DIM, t(locale, 'main.xp_rebalance_footer'), RESET);
    out += boxBottom(70);
    out += '\n';
    return out;
}
// ── main ─────────────────────────────────────────────────────────────────────
export function renderMain(ctx) {
    const { state, data, locale } = ctx;
    const thresholds = data.thresholds ?? [];
    const threshold = (lvl) => thresholds[lvl];
    const maxLevel = thresholds.length - 1;
    const lineage = state.lineage ?? 'fire';
    const level = Number(state.current_level);
    const totalXp = Number(state.total_xp);
    const isShiny = state.is_shiny === true;
    const createdAt = jqStr(state.created_at);
    let out = '';
    out += renderRebalanceNotice(ctx, totalXp);
    const name = evoField(data, state, lineage, level, 'name');
    const emoji = evoField(data, state, lineage, level, 'emoji');
    const lineageLabel = data.lineages?.[lineage]?.label ?? 'null';
    // Current stage min_level + next stage min_level.
    const curStage = resolveStageDefault(data, lineage, level);
    const curStageLvl = curStage ? Number(curStage.min_level) : 0;
    const stages = data.lineages?.[lineage]?.stages ?? [];
    const nextStages = stages.filter((s) => s.min_level > level);
    const nextLvl = nextStages.length === 0 ? null : Math.min(...nextStages.map((s) => Number(s.min_level)));
    out += '\n';
    out += boxTop(t(locale, 'main.companion'), 64);
    // Sprite (when the cached file exists). bash: `printf '  %s\n' "$line"` per
    // line + a trailing newline. Absent → no block (matches the R3a fixtures).
    if (ctx.sprite && ctx.sprite.length > 0) {
        for (const line of ctx.sprite)
            out += `  ${line}\n`;
        out += '\n';
    }
    const shinyBadge = isShiny ? `${GOLD}★ SHINY${RESET}  ` : '';
    out += bashPrintf(`  %s%s${t(locale, 'main.companion')}%s   %s%s%s%s   %sdepuis %s%s\n\n`, BOLD, '', RESET, shinyBadge, DIM, lineageLabel, RESET, DIM, createdAt.slice(0, 10), RESET);
    if (level >= maxLevel) {
        out += bashPrintf('  %s   %s%s%s   %s%sLv.%d%s   %sLv.MAX ✦%s\n\n', emoji, name, RESET, RESET, '', BOLD, level, RESET, BOLD, RESET);
    }
    else if (nextLvl === null) {
        const curThreshold = threshold(curStageLvl);
        const nextThreshold = threshold(maxLevel);
        const bandTotal = nextThreshold - curThreshold;
        const remaining = nextThreshold - totalXp;
        let pct = Math.floor(((totalXp - curThreshold) * 100) / bandTotal);
        pct = Math.max(0, Math.min(100, pct));
        out += bashPrintf('  %s   %s%s%s%s   %s%sLv.%d%s\n\n', emoji, '', BOLD, name, RESET, '', BOLD, level, RESET);
        out += bashPrintf('  %s%s%s   %s%d%% vers Lv.MAX (forme stable)%s\n\n', '', progressBar(pct), RESET, DIM, pct, RESET);
        out += bashPrintf(`  %s${tPad(locale, 'main.xp_total', 22)}%s :  %s tokens\n`, DIM, RESET, fmtInt(totalXp));
        out += bashPrintf(`  %s${tPad(locale, 'main.remaining', 22)}%s :  %s tokens (Lv.%d)\n\n`, DIM, RESET, fmtInt(remaining), maxLevel);
    }
    else {
        const curThreshold = threshold(curStageLvl);
        const nextThreshold = threshold(nextLvl);
        const bandXp = totalXp - curThreshold;
        const bandTotal = nextThreshold - curThreshold;
        const remaining = nextThreshold - totalXp;
        let pct = Math.floor((bandXp * 100) / bandTotal);
        pct = Math.max(0, Math.min(100, pct));
        const nextStage = stages.filter((s) => s.min_level > level).sort((a, b) => a.min_level - b.min_level)[0];
        const nextName = jqStr(nextStage?.name);
        const nextEmoji = jqStr(nextStage?.emoji);
        out += bashPrintf('  %s   %s%s%s%s   %s%sLv.%d%s\n\n', emoji, '', BOLD, name, RESET, '', BOLD, level, RESET);
        out += bashPrintf('  %s%s%s   %s%d%% vers %s %s%s\n\n', '', progressBar(pct), RESET, DIM, pct, nextEmoji, nextName, RESET);
        out += bashPrintf(`  %s${tPad(locale, 'main.xp_total', 22)}%s :  %s tokens\n`, DIM, RESET, fmtInt(totalXp));
        out += bashPrintf(`  %s${tPad(locale, 'main.stage_progress', 22)}%s :  %s / %s\n`, DIM, RESET, fmtInt(bandXp), fmtInt(bandTotal));
        out += bashPrintf(`  %s${tPad(locale, 'main.remaining', 22)}%s :  %s tokens (Lv.%d)\n\n`, DIM, RESET, fmtInt(remaining), nextLvl);
    }
    // Moves
    const moves = stageFieldWithFallback(data, state, lineage, level, (s) => {
        const m = s.moves ?? [];
        return m.length === 0 ? '' : m.join(', ');
    });
    if (moves)
        out += bashPrintf(`  %s${tPad(locale, 'main.moves', 22)}%s :  %s\n\n`, DIM, RESET, moves);
    // Types (lang from data.json, as in bash)
    const typesStage = (() => {
        if (lineage === 'eevee' && level >= 30 && state.eevee_form) {
            const st = eeveeFormStage(data, state.eevee_form);
            if (st && Array.isArray(st.types))
                return st.types;
        }
        const st = resolveStageDefault(data, lineage, level);
        return st && Array.isArray(st.types) ? st.types : [];
    })();
    if (typesStage.length > 0) {
        let line = bashPrintf(`  %s${tPad(locale, 'main.types', 22)}%s :  `, DIM, RESET);
        let first = true;
        for (const ty of typesStage) {
            if (!first)
                line += ' ';
            line += `${''}[ ${ty} ]${RESET}`;
            first = false;
        }
        out += line + '\n\n';
    }
    // Pokédex entry
    const lang = data.language ?? 'fr';
    const pokedexEntry = stageFieldWithFallback(data, state, lineage, level, (s) => {
        const v = s[`pokedex_${lang}`];
        return v == null ? '' : String(v);
    });
    if (pokedexEntry) {
        out += bashPrintf(`  %s${tPad(locale, 'main.pokedex_entry', 22)}%s :  %s%s%s\n\n`, DIM, RESET, DIM, pokedexEntry, RESET);
    }
    // Held item
    const heldItem = state.held_item ?? '';
    if (heldItem) {
        const meta = data.items?.[heldItem];
        const heldName = meta?.name ?? heldItem;
        const heldEmoji = meta?.emoji ?? '?';
        out += bashPrintf(`  %s${tPad(locale, 'main.held_item', 22)}%s :  %s %s\n\n`, DIM, RESET, heldEmoji, heldName);
    }
    // Injured. Bash passes "${BOLD}\\033[91m" as the first arg — in double quotes
    // \033 is a LITERAL backslash sequence (not an ESC byte), so the ANSI strip
    // regex leaves it in the output. Reproduce that literal exactly.
    const injured = Number(state.injured_ticks_remaining ?? 0);
    if (injured > 0) {
        out += bashPrintf(`  %s${t(locale, 'main.status_injured')}%s   %s(${injured} ticks remaining)%s\n\n`, BOLD + '\\033[91m', RESET, DIM, RESET);
    }
    // Friendship
    const friendship = Number(state.friendship ?? 0);
    if (friendship > 0) {
        let heart = '💗';
        if (friendship >= 100)
            heart = '💖';
        if (friendship >= 500)
            heart = '💞';
        out += bashPrintf(`  %s${tPad(locale, 'main.friendship', 22)}%s :  %s %s\n\n`, DIM, RESET, heart, friendship);
    }
    // Badges summary
    const badges = Array.isArray(state.badges) ? state.badges : [];
    if (badges.length > 0) {
        let line = bashPrintf(`  %s${tPad(locale, 'main.badges', 22)}%s :  `, DIM, RESET);
        for (const b of badges)
            line += bashPrintf('%s ', BADGE_EMOJI[b.id] ?? '?');
        line += bashPrintf(' %s(%d/%d)%s\n\n', DIM, badges.length, 15, RESET);
        out += line;
    }
    out += boxBottom(64);
    out += '\n';
    // Recent events (no scenario exercises this; ported for completeness)
    const events = Array.isArray(state.recent_events) ? state.recent_events : [];
    if (events.length > 0) {
        out += bashPrintf(`  %s${t(locale, 'main.recent_events')}%s\n`, BOLD, RESET);
        for (const ev of events.slice(0, 3)) {
            const at = jqStr(ev.at).replace(/T/g, ' ');
            const ename = jqStr(ev.name ?? '');
            const eemoji = jqStr(ev.emoji ?? '');
            const eid = jqStr(ev.id ?? '');
            const exp = ev.xp ?? 0;
            const wildName = (id) => {
                const w = (data.wild_pool ?? []).find((p) => p.id === id);
                return jqStr(w?.[`name_${lang}`]);
            };
            const wildEmoji = (id) => {
                const w = (data.wild_pool ?? []).find((p) => p.id === id);
                return jqStr(w?.emoji);
            };
            switch (ev.type) {
                case 'berry':
                    out += bashPrintf('   🍇 %s%s %s +%s XP   %s%s%s\n', eemoji, RESET, ename, exp, DIM, at, RESET);
                    break;
                case 'encounter':
                    out += bashPrintf('   ✨ %s %s   %s%s%s\n', wildEmoji(eid), wildName(eid), DIM, at, RESET);
                    break;
                case 'battle_won':
                    out += bashPrintf(`   ⚔️  ${t(locale, 'battle.won', wildName(eid), exp)}   %s%s%s\n`, DIM, at, RESET);
                    break;
                case 'battle_lost':
                    out += bashPrintf(`   💔 ${t(locale, 'battle.lost', wildName(eid))}   %s%s%s\n`, DIM, at, RESET);
                    break;
                case 'item':
                    out += bashPrintf('   🎁 %s%s %s obtenu   %s%s%s\n', eemoji, RESET, ename, DIM, at, RESET);
                    break;
                case 'trade':
                    out += bashPrintf(`   🔄 ${t(locale, 'trade.title')}: %s   %s%s%s\n`, ename, DIM, at, RESET);
                    break;
                default:
                    out += bashPrintf('   • %s   %s%s%s\n', jqStr(ev.type), DIM, at, RESET);
            }
        }
        out += '\n';
    }
    // Evolution history
    const history = Array.isArray(state.evolution_history) ? state.evolution_history : [];
    if (history.length > 0) {
        out += boxTop(t(locale, 'main.history'), 64);
        for (const h of history) {
            const lvl = h.level; // may be undefined → bashPrintf %d → 0
            const ename = jqStr(h.name);
            const eat = jqStr(h.evolved_at).replace(/T/g, ' ');
            const eshiny = h.is_shiny === true;
            const eemoji = evoField(data, state, lineage, lvl ?? 'null', 'emoji');
            const star = eshiny ? `${GOLD}★${RESET} ` : '';
            out += bashPrintf('  %sLv.%-3d%s  %s  %s%-22s  %s%s%s\n', DIM, lvl === undefined ? 'null' : lvl, RESET, eemoji, star, ename, DIM, eat, RESET);
        }
        out += '\n';
        out += boxBottom(64);
        out += '\n';
    }
    // Full chain
    out += boxTop(`${t(locale, 'main.full_chain')} — ${lineageLabel}`, 64);
    const eeveeFormId = lineage === 'eevee' ? (state.eevee_form ?? '') : '';
    for (const s of stages) {
        const imin = Number(s.min_level);
        const iname = jqStr(s.name);
        const iemoji = jqStr(s.emoji);
        const ishow = s.showdown_id;
        const ithresh = threshold(imin);
        let marker;
        let style;
        if (eeveeFormId && imin === 30) {
            if (ishow === eeveeFormId) {
                marker = `${BOLD}►${RESET}`;
                style = '';
            }
            else {
                marker = ' ';
                style = DIM;
            }
        }
        else if (imin < curStageLvl) {
            marker = `${BOLD}✓${RESET}`;
            style = DIM;
        }
        else if (imin === curStageLvl) {
            marker = `${BOLD}►${RESET}`;
            style = '';
        }
        else {
            marker = ' ';
            style = DIM;
        }
        out += bashPrintf('   %s  %sLv.%-3d%s  %s  %s%-22s%s  %s%s tokens%s\n', marker, style, imin, RESET, iemoji, style, iname, RESET, DIM, fmtInt(ithresh), RESET);
    }
    out += boxBottom(64);
    out += '\n';
    // Footer
    out += bashPrintf(`  %s${tPad(locale, 'common.subcommands', 22)}%s : team, pc, pokedex, stats, badges, switch, hatch, deposit, withdraw, give, take, trade, reset, --shiny\n`, DIM, RESET);
    out += bashPrintf(`  %s${tPad(locale, 'common.example', 22)}%s : %sbash ~/.claude/pokemon-status.sh team%s\n\n`, DIM, RESET, DIM, RESET);
    return out;
}
// ── recap ────────────────────────────────────────────────────────────────────
// The session/today scopes depend on the wall clock (bash used `date`); we take
// nowEpoch from the context. The fixtures only exercise the deterministic
// no-active-session path (sessions:{}), which never reads the clock.
export function renderRecap(ctx, scope = 'session') {
    const { state, data, locale } = ctx;
    let out = bashPrintf(`\n  %s%s${t(locale, 'recap.title')}%s\n\n`, BOLD, GOLD, RESET);
    const sessions = state.sessions ?? {};
    const activeSid = () => {
        const entries = Object.entries(sessions);
        if (entries.length === 0)
            return '';
        entries.sort((a, b) => {
            const la = a[1].last_seen ?? '';
            const lb = b[1].last_seen ?? '';
            return la < lb ? -1 : la > lb ? 1 : 0;
        });
        return entries[entries.length - 1][0];
    };
    let sinceIso;
    let label;
    let sid = '';
    if (scope === 'today') {
        const now = ctx.nowEpoch ?? 0;
        sinceIso = new Date(now * 1000).toISOString().slice(0, 10) + 'T00:00:00Z';
        label = t(locale, 'recap.scope_today');
    }
    else if (scope === 'session' || scope === '') {
        sid = activeSid();
        if (!sid || sid === 'null') {
            out += bashPrintf(`  %s${t(locale, 'recap.no_session')}%s\n\n`, DIM, RESET);
            return out;
        }
        sinceIso = jqStr(sessions[sid]?.first_seen);
        label = t(locale, 'recap.scope_session');
    }
    else {
        out += bashPrintf(`  %s${t(locale, 'recap.unknown_scope', scope)}%s\n\n`, DIM, RESET);
        return out;
    }
    const nowEpoch = ctx.nowEpoch ?? 0;
    const sinceEpoch = Number.isFinite(Date.parse(sinceIso)) ? Math.floor(Date.parse(sinceIso) / 1000) : nowEpoch;
    const durMin = Math.floor((nowEpoch - sinceEpoch) / 60);
    const durLabel = durMin < 60 ? `${durMin}min` : `${Math.floor(durMin / 60)}h${bashPrintf('%02d', durMin % 60)}`;
    out += bashPrintf(`  %s${t(locale, 'recap.context', label, durLabel)}%s\n\n`, DIM, RESET);
    if (scope === 'session' || scope === '') {
        const baseline = sessions[sid]?.baseline ?? null;
        if (baseline !== null) {
            const xpDelta = Number(state.total_xp) - Number(baseline.total_xp);
            const frDelta = Number(state.friendship ?? 0) - Number(baseline.friendship);
            const tokDelta = Number(state.lifetime_stats?.total_tokens) - Number(baseline.lifetime_tokens);
            const lvlNow = Number(state.current_level);
            const lvlThen = Number(baseline.current_level);
            out += bashPrintf(`  %s%s${t(locale, 'recap.deltas')}%s\n`, BOLD, GOLD, RESET);
            out += bashPrintf(`    %s${tPad(locale, 'recap.tokens_consumed', 22)}%s :  %s\n`, DIM, RESET, fmtInt(tokDelta));
            out += bashPrintf(`    %s${tPad(locale, 'recap.xp_gained', 22)}%s :  +%s\n`, DIM, RESET, fmtInt(xpDelta));
            out += bashPrintf(`    %s${tPad(locale, 'recap.friendship_gained', 22)}%s :  +%s\n`, DIM, RESET, fmtInt(frDelta));
            if (lvlNow > lvlThen) {
                out += bashPrintf(`    %s${tPad(locale, 'recap.level_progress', 22)}%s :  Lv.%s → %sLv.%s%s\n`, DIM, RESET, lvlThen, GOLD, lvlNow, RESET);
            }
            else if (lvlNow === 0) {
                const threshold1 = data.thresholds?.[1] ?? 1;
                const pct = Math.trunc((Number(state.total_xp) / threshold1) * 100);
                out += bashPrintf(`    %s${tPad(locale, 'recap.hatch_progress', 22)}%s :  %s%% vers Lv.1\n`, DIM, RESET, pct);
            }
            else {
                out += bashPrintf(`    %s${tPad(locale, 'recap.level_stable', 22)}%s :  Lv.%s\n`, DIM, RESET, lvlNow);
            }
            out += '\n';
        }
    }
    const lang = data.language ?? 'fr';
    // bash: `jq '.wild_pool[] | select(.id==$id) | .[…]'` → empty string on no
    // match (not the literal "null"); a matched-but-null field → "null".
    const wildName = (id) => {
        const w = (data.wild_pool ?? []).find((p) => p.id === id);
        return w === undefined ? '' : jqStr(w[`name_${lang}`]);
    };
    const wildEmoji = (id) => {
        const w = (data.wild_pool ?? []).find((p) => p.id === id);
        return w === undefined ? '' : jqStr(w.emoji);
    };
    // jq `select(.at >= $since)`: a MISSING timestamp is null, and `null >= "str"`
    // is false → excluded. A jqStr coercion to "null" would wrongly include it
    // ("null" >= date is true lexicographically).
    const sinceFilter = (v) => typeof v === 'string' && v >= sinceIso;
    const allEvents = Array.isArray(state.recent_events) ? state.recent_events : [];
    const events = allEvents.filter((e) => sinceFilter(e.at));
    if (events.length === 0) {
        out += bashPrintf(`  %s${t(locale, 'recap.no_events')}%s\n\n`, DIM, RESET);
    }
    else {
        out += bashPrintf(`  %s%s${t(locale, 'recap.events_title', events.length)}%s\n`, BOLD, GOLD, RESET);
        for (const ev of events) {
            const timeShort = jqStr(ev.at).slice(11, 16);
            const eid = jqStr(ev.id ?? '');
            const exp = ev.xp ?? 0;
            const ename = jqStr(ev.name ?? '');
            const eemoji = jqStr(ev.emoji ?? '');
            const wlvl = ev.wild_level ?? 0;
            switch (ev.type) {
                case 'berry':
                    out += bashPrintf('    %s%s%s  🍇 %s%s %s +%s XP\n', DIM, timeShort, RESET, eemoji, RESET, ename, exp);
                    break;
                case 'encounter':
                    out += bashPrintf('    %s%s%s  🎯 %s%s %s rencontré\n', DIM, timeShort, RESET, wildEmoji(eid), RESET, wildName(eid));
                    break;
                case 'battle_won':
                    out += bashPrintf('    %s%s%s  ⚔️  %sbattle won%s vs %s Lv.%s (+%s XP)\n', DIM, timeShort, RESET, GOLD, RESET, wildName(eid), wlvl, exp);
                    break;
                case 'battle_lost':
                    out += bashPrintf('    %s%s%s  💢 %sbattle lost%s vs %s Lv.%s\n', DIM, timeShort, RESET, DIM, RESET, wildName(eid), wlvl);
                    break;
                case 'item':
                    out += bashPrintf('    %s%s%s  🎁 %s%s %s obtenu\n', DIM, timeShort, RESET, eemoji, RESET, ename);
                    break;
            }
        }
        out += '\n';
    }
    const allEvos = Array.isArray(state.evolution_history) ? state.evolution_history : [];
    const evos = allEvos.filter((e) => sinceFilter(e.evolved_at));
    if (evos.length > 0) {
        out += bashPrintf(`  %s%s${t(locale, 'recap.evolutions_title')}%s\n`, BOLD, GOLD, RESET);
        for (const ev of evos) {
            out += bashPrintf('    %s%s%s  ✨ Lv.%s — %s%s%s\n', DIM, jqStr(ev.evolved_at).slice(11, 16), RESET, jqStr(ev.level), BOLD, jqStr(ev.name), RESET);
        }
        out += '\n';
    }
    const allBadges = Array.isArray(state.badges) ? state.badges : [];
    const newBadges = allBadges.filter((b) => sinceFilter(b.earned_at));
    if (newBadges.length > 0) {
        out += bashPrintf(`  %s%s${t(locale, 'recap.badges_title')}%s\n`, BOLD, GOLD, RESET);
        for (const b of newBadges) {
            out += bashPrintf('    %s%s%s  %s  %s%s%s\n', DIM, jqStr(b.earned_at).slice(11, 16), RESET, BADGE_EMOJI[b.id] ?? '?', BOLD, t(locale, `badges.${b.id}.0`), RESET);
        }
        out += '\n';
    }
    return out;
}
// ── trainer-card ────────────────────────────────────────────────────────────────
export function renderTrainerCard(ctx) {
    const { state, data, locale } = ctx;
    let out = '\n';
    out += boxTop(t(locale, 'trainer_card.title'), 64);
    const lineage = state.lineage ?? 'fire';
    const level = Number(state.current_level);
    const isShiny = state.is_shiny === true;
    const createdAt = jqStr(state.created_at ?? '—');
    const ls = state.lifetime_stats ?? {};
    const share = data.stats_share ?? {};
    // jq '… // ""' → null becomes "".
    const shareEnabled = share.enabled === true;
    const shareAnon = share.anon_id ?? '';
    const shareName = share.display_name ?? '';
    const lineageLabel = data.lineages?.[lineage]?.label ?? lineage;
    const totalLineages = Object.keys(data.lineages ?? {}).length;
    const stageName = evoField(data, state, lineage, level, 'name');
    const stageEmoji = evoField(data, state, lineage, level, 'emoji');
    const shinyMark = isShiny ? ` ${GOLD}✦${RESET}` : '';
    let label;
    if (shareName && shareAnon)
        label = `${shareName}#${String(shareAnon).slice(0, 4)}`;
    else if (shareAnon)
        label = String(shareAnon);
    else
        label = t(locale, 'trainer_card.unnamed');
    out += bashPrintf('\n  %s🎮 %s%s%s%s\n', BOLD, GOLD, label, RESET, shinyMark);
    out += bashPrintf(`  %s${t(locale, 'trainer_card.trainer_since', createdAt.slice(0, 10))}%s\n\n`, DIM, RESET);
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.companion', 22)}%s :  %s %s%s%s · Lv.%s\n`, DIM, RESET, stageEmoji, BOLD, stageName, RESET, level);
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.lineage', 22)}%s :  %s %s\n\n`, DIM, RESET, lineageEmoji(lineage), lineageLabel);
    out += bashPrintf(`  %s%s${t(locale, 'trainer_card.stats_section')}%s\n`, BOLD, GOLD, RESET);
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.tokens', 22)}%s :  %s\n`, DIM, RESET, fmtInt(ls.total_tokens ?? 0));
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.xp', 22)}%s :  %s\n`, DIM, RESET, fmtInt(state.total_xp));
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.friendship', 22)}%s :  %s\n`, DIM, RESET, fmtInt(state.friendship ?? 0));
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.shinies', 22)}%s :  %s\n`, DIM, RESET, Number(ls.total_shinies ?? 0));
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.lineages_done', 22)}%s :  %s / %s\n`, DIM, RESET, Array.isArray(ls.lineages_completed) ? ls.lineages_completed.length : 0, totalLineages);
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.games', 22)}%s :  %s / %s\n`, DIM, RESET, Number(ls.games_won ?? 0), Number(ls.games_played ?? 0));
    out += bashPrintf(`  %s${tPad(locale, 'trainer_card.pokedex', 22)}%s :  %s / 251\n\n`, DIM, RESET, Object.keys(state.pokedex_wild ?? {}).length);
    const badges = Array.isArray(state.badges) ? state.badges : [];
    if (badges.length > 0) {
        out += bashPrintf(`  %s%s${t(locale, 'trainer_card.badges_section', badges.length)}%s\n`, BOLD, GOLD, RESET);
        for (const b of badges) {
            out += bashPrintf('  %s · %s\n', BADGE_EMOJI[b.id] ?? '?', t(locale, `badges.${b.id}.0`));
        }
        out += '\n';
    }
    out += bashPrintf(`  %s%s${t(locale, 'trainer_card.share_section')}%s\n`, BOLD, GOLD, RESET);
    if (shareEnabled) {
        out += bashPrintf(`  %s${t(locale, 'trainer_card.share_active', shareAnon)}%s\n`, DIM, RESET);
        if (shareName)
            out += bashPrintf(`  %s${t(locale, 'trainer_card.share_pseudo', shareName)}%s\n`, DIM, RESET);
    }
    else {
        out += bashPrintf(`  %s${t(locale, 'trainer_card.share_inactive')}%s\n`, DIM, RESET);
    }
    out += bashPrintf(`  %s${t(locale, 'trainer_card.arena_soon')}%s\n`, DIM, RESET);
    out += boxBottom(64);
    out += '\n';
    return out;
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