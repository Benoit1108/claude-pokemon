// Async PvP arena commands (Phase R3d-4b): status / enable / disable /
// regenerate / opponents / challenge / battle. The engine does the HTTP fetch
// (Node) and battle-replay rendering; bash owns the arena_secret FILE (a
// separate chmod-600 file), so runArena returns a `secret` op signal instead of
// touching the filesystem. live / pair / link → null (handled elsewhere).
import { execFileSync } from 'node:child_process';
import { bashPrintf } from './render/printf.js';
import { t } from './render/i18n.js';
import { lineageEmoji } from './render/views.js';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[33m';
// Port of _arena_build_team — null when there's no active companion.
export function buildTeam(state, anonId, displayName) {
    const lineage = state.lineage ?? '';
    const level = Number(state.current_level ?? 0);
    if (!lineage || level < 1)
        return null;
    const team = { anon_id: anonId, lineage, level, is_shiny: state.is_shiny ?? false };
    if (displayName !== '')
        team.display_name = displayName;
    return team;
}
// Port of _arena_render_battle — challenger vs defender + turn log + winner.
export function renderBattle(locale, raw) {
    const b = raw.battle ?? raw;
    const c = b.challenger ?? {};
    const d = b.defender ?? {};
    const cName = c.display_name ?? c.anon_id;
    const dName = d.display_name ?? d.anon_id;
    const cEmoji = lineageEmoji(c.lineage);
    const dEmoji = lineageEmoji(d.lineage);
    const cStar = c.is_shiny === true ? '★' : '';
    const dStar = d.is_shiny === true ? '★' : '';
    let out = bashPrintf('  %s%s %s %s%s %sLv.%s%s   %svs%s   %s%s %s %s%s %sLv.%s%s\n\n', BOLD, cEmoji, cName, cStar, RESET, DIM, c.level, RESET, DIM, RESET, BOLD, dEmoji, dName, dStar, RESET, DIM, d.level, RESET);
    for (const turn of b.turns ?? []) {
        const who = turn.actor === 'challenger' ? cEmoji : dEmoji;
        const eff = String(turn.effectiveness);
        const effLabel = eff === '2.0' || eff === '2' ? '2.0×' : eff === '0.5' ? '0.5×' : '';
        const critLabel = turn.critical === true ? ' CRIT!' : '';
        out += bashPrintf('  %sTurn %2s%s  %s -%s HP %s%s%s\n', DIM, String(turn.turn), RESET, who, turn.damage, DIM, effLabel + critLabel, RESET);
    }
    out += '\n';
    const winner = b.winner;
    if (winner === 'challenger')
        out += bashPrintf(`  %s%s${t(locale, 'arena.winner_challenger', cName)}%s\n\n`, BOLD, GOLD, RESET);
    else if (winner === 'defender')
        out += bashPrintf(`  %s%s${t(locale, 'arena.winner_defender', dName)}%s\n\n`, BOLD, GOLD, RESET);
    else
        out += bashPrintf(`  %s${t(locale, 'arena.winner_draw')}%s\n\n`, DIM, RESET);
    out += bashPrintf(`  %s${t(locale, 'arena.battle_summary', (b.turns ?? []).length, b.reason)}%s\n\n`, DIM, RESET);
    return out;
}
const PAIR_CODE_RE = /^[A-HJ-NP-TV-Z2-9]{6}$/;
// Port of _link_apply_trainer_to_state: rewrite state from a TrainerResponse.
export function applyTrainerToState(state, trainer, now) {
    const s = JSON.parse(JSON.stringify(state));
    const active = trainer.stats?.active ?? {};
    const lt = trainer.stats?.lifetime ?? {};
    s.lineage = active.lineage;
    s.is_shiny = active.is_shiny;
    s.current_level = active.current_level;
    s.lifetime_stats ??= {};
    s.lifetime_stats.total_tokens = lt.total_tokens ?? 0;
    s.lifetime_stats.total_evolutions = lt.total_evolutions ?? 0;
    s.lifetime_stats.total_shinies = lt.total_shinies ?? 0;
    s.lifetime_stats.max_level = lt.max_level ?? 0;
    s.lifetime_stats.total_compagnons = lt.total_compagnons ?? 0;
    s.lifetime_stats.lineages_completed = lt.lineages_completed ?? [];
    s.lifetime_stats.games_won = lt.games_won ?? 0;
    s.lifetime_stats.games_played = lt.games_played ?? 0;
    s.badges = (trainer.stats?.badges ?? []).map((id) => ({ id, earned_at: now }));
    const wild = {};
    for (const id of trainer.stats?.pokedex_seen_ids ?? [])
        wild[id] = { count: 1, first_seen_at: now };
    s.pokedex_wild = wild;
    s.last_updated = now;
    return s;
}
// QR of the pair URL via the optional `qrencode` binary (like chafa for sprites
// — absent → graceful hint). Returns the indented QR block or null.
function qrBlock(url) {
    try {
        const out = execFileSync('qrencode', ['-t', 'ANSIUTF8', '-m', '1', url], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        return out.replace(/\n$/, '').split('\n').map((l) => '  ' + l).join('\n');
    }
    catch {
        return null;
    }
}
async function getJson(url, init) {
    try {
        const r = await fetch(url, init);
        if (!r.ok)
            return null;
        return await r.json();
    }
    catch {
        return null;
    }
}
// POST that returns the parsed body even on error (bash uses `curl -s`, not -sf).
async function postJson(url, init) {
    try {
        return await (await fetch(url, init)).json();
    }
    catch {
        return {};
    }
}
/** Returns null for live/pair/link/unknown → bash dispatcher falls back. */
export async function runArena(input) {
    const { locale, now } = input;
    const data = JSON.parse(JSON.stringify(input.data));
    const L = (k, ...a) => t(locale, k, ...a);
    const sub = input.args[0] ?? 'status';
    const endpoint = data.stats_share?.endpoint ?? '';
    const webUrl = data.arena?.web_url ?? 'https://claude-pokemon-arena.pages.dev';
    const anonId = data.stats_share?.anon_id ?? '';
    const displayName = data.stats_share?.display_name ?? '';
    const enabled = data.arena?.enabled === true;
    const secret = input.arenaSecret;
    let secretOp = null;
    let dataChanged = false;
    let stateOut = input.state;
    let stateChanged = false;
    let out = bashPrintf(`\n  %s%s${L('arena.title')}%s\n\n`, BOLD, GOLD, RESET);
    const line = (k, color, ...a) => {
        out += bashPrintf(`  %s${L(k, ...a)}%s\n\n`, color, RESET);
    };
    const ensureArena = () => (data.arena ??= {});
    switch (sub) {
        case 'enable':
        case 'on': {
            if (!anonId) {
                line('arena.no_anon_id', DIM);
                break;
            }
            if (enabled) {
                line('arena.already_enabled', DIM);
                break;
            }
            if (input.args[1] !== '--confirm') {
                line('arena.privacy_notice', DIM);
                line('arena.confirm_hint', BOLD);
                break;
            }
            const team = buildTeam(input.state, anonId, displayName);
            if (!team) {
                line('arena.no_active', DIM);
                break;
            }
            const resp = await postJson(`${endpoint}/v1/arena/enable`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(team),
            });
            const sec = resp.arena_secret ?? '';
            if (!sec) {
                const errCode = resp.error ?? '';
                let errMsg;
                if (errCode === 'validation')
                    errMsg = (resp.details ?? []).join('; ');
                else if (errCode === 'already_enabled')
                    errMsg = L('arena.already_enabled');
                else if (errCode === '')
                    errMsg = typeof resp === 'string' ? resp : JSON.stringify(resp);
                else
                    errMsg = errCode;
                // err message as an arg, never in the format (a literal % would corrupt).
                out += bashPrintf('  %s%s%s\n\n', DIM, L('arena.enable_failed', errMsg), RESET);
                break;
            }
            secretOp = { action: 'save', value: sec };
            ensureArena().enabled = true;
            data.arena.enabled_at = now;
            dataChanged = true;
            line('arena.enabled', GOLD, anonId);
            break;
        }
        case 'disable':
        case 'off': {
            if (!enabled) {
                line('arena.already_disabled', DIM);
                break;
            }
            if (!secret) {
                line('arena.no_secret', DIM);
                break;
            }
            await fetch(`${endpoint}/v1/arena/disable?anon_id=${anonId}`, {
                method: 'DELETE',
                headers: { authorization: `Bearer ${secret}` },
            }).catch(() => undefined);
            secretOp = { action: 'clear' };
            ensureArena().enabled = false;
            dataChanged = true;
            line('arena.disabled', DIM);
            break;
        }
        case 'regenerate':
        case 'rotate': {
            if (!enabled) {
                line('arena.not_enabled', DIM);
                break;
            }
            if (!secret) {
                line('arena.no_secret', DIM);
                break;
            }
            const team = buildTeam(input.state, anonId, displayName);
            if (!team) {
                line('arena.no_active', DIM);
                break;
            }
            const resp = await postJson(`${endpoint}/v1/arena/regenerate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
                body: JSON.stringify(team),
            });
            const newSec = resp.arena_secret ?? '';
            if (!newSec) {
                line('arena.regen_failed', DIM, JSON.stringify(resp));
                break;
            }
            secretOp = { action: 'save', value: newSec };
            line('arena.regen_ok', GOLD);
            break;
        }
        case 'opponents':
        case 'list': {
            const limit = input.args[1] ?? '10';
            const resp = await getJson(`${endpoint}/v1/arena/opponents?limit=${limit}`);
            if (resp === null) {
                line('arena.fetch_failed', DIM);
                break;
            }
            line('arena.opponents_count', DIM, resp.total ?? 0);
            for (const o of resp.opponents ?? []) {
                const shinyMark = o.is_shiny === true ? ' ★' : '';
                out += bashPrintf('  %s#%s%s  %s  Lv.%s  %s%s\n', DIM, o.anon_id, RESET, lineageEmoji(o.lineage), o.level, o.display_name ?? o.anon_id, shinyMark);
            }
            out += bashPrintf(`\n  %s${L('arena.opponents_hint')}%s\n\n`, DIM, RESET);
            break;
        }
        case 'challenge':
        case 'fight': {
            const target = input.args[1] ?? '';
            if (!target) {
                line('arena.challenge_usage', DIM);
                break;
            }
            if (!enabled) {
                line('arena.not_enabled', DIM);
                break;
            }
            if (!secret) {
                line('arena.no_secret', DIM);
                break;
            }
            const resp = await postJson(`${endpoint}/v1/arena/challenge`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
                body: JSON.stringify({ challenger_anon_id: anonId, defender_anon_id: target }),
            });
            const battleId = resp.battle?.battle_id ?? '';
            if (!battleId) {
                line('arena.challenge_failed', DIM, JSON.stringify(resp));
                break;
            }
            ensureArena().last_battle_id = battleId;
            dataChanged = true;
            out += renderBattle(locale, resp);
            line('arena.replay', DIM, webUrl, battleId);
            break;
        }
        case 'battle':
        case 'view': {
            const id = input.args[1] || (data.arena?.last_battle_id ?? '');
            if (!id) {
                line('arena.battle_usage', DIM);
                break;
            }
            const resp = await getJson(`${endpoint}/v1/arena/battle/${id}`);
            if (resp === null) {
                line('arena.battle_not_found', DIM, id);
                break;
            }
            out += renderBattle(locale, resp);
            line('arena.replay', DIM, webUrl, id);
            break;
        }
        case 'status':
        case '': {
            if (enabled)
                out += bashPrintf(`  %s${L('arena.status_enabled', anonId)}%s\n`, GOLD, RESET);
            else
                out += bashPrintf(`  %s${L('arena.status_disabled')}%s\n`, DIM, RESET);
            out += bashPrintf(`  %s${L('arena.status_endpoint', endpoint)}%s\n\n`, DIM, RESET);
            out += bashPrintf(`  %s${L('arena.usage')}%s\n\n`, DIM, RESET);
            break;
        }
        case 'pair': {
            // bash prints arena.title (already in `out`) then pair.title.
            out += bashPrintf(`\n  %s%s${L('pair.title')}%s\n\n`, BOLD, GOLD, RESET);
            if (!enabled || !anonId) {
                line('live.not_enabled', DIM);
                break;
            }
            if (!secret) {
                line('arena.no_secret', DIM);
                break;
            }
            const resp = await postJson(`${endpoint}/v1/arena/pair/init`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
                body: JSON.stringify({ anon_id: anonId }),
            });
            const code = resp.code ?? '';
            if (!code) {
                line('pair.failed', DIM, JSON.stringify(resp));
                break;
            }
            const pairUrl = `${webUrl}/pair?code=${code}`;
            out += bashPrintf(`  %s${L('pair.code_label')}%s   %s%s%s\n\n`, DIM, RESET, BOLD + GOLD, code, RESET);
            out += bashPrintf(`  %s${L('pair.url_label')}%s\n`, DIM, RESET);
            out += bashPrintf('  %s%s%s\n\n', BOLD, pairUrl, RESET);
            const qr = qrBlock(pairUrl);
            if (qr !== null) {
                out += bashPrintf(`  %s${L('pair.qr_label')}%s\n`, DIM, RESET);
                out += qr + '\n\n';
            }
            else {
                out += bashPrintf(`  %s${L('pair.qr_hint')}%s\n\n`, DIM, RESET);
            }
            out += bashPrintf(`  %s${L('pair.expires', resp.expires_at ?? '')}%s\n\n`, DIM, RESET);
            out += bashPrintf(`  %s${L('pair.warning')}%s\n\n`, DIM, RESET);
            break;
        }
        case 'link': {
            // bash prints arena.title (already in `out`) then link.title.
            out += bashPrintf(`\n  %s%s${L('link.title')}%s\n\n`, BOLD, GOLD, RESET);
            const code = input.args[1] ?? '';
            if (!code) {
                out += bashPrintf(`  %s${L('link.usage')}%s\n\n`, DIM, RESET);
                break;
            }
            const upper = code.toUpperCase();
            if (!PAIR_CODE_RE.test(upper)) {
                out += bashPrintf(`  %s${L('link.invalid_code')}%s\n\n`, DIM, RESET);
                break;
            }
            if (enabled && anonId)
                out += bashPrintf(`  %s${L('link.warn_existing', anonId)}%s\n\n`, DIM, RESET);
            const resp = await postJson(`${endpoint}/v1/arena/pair/redeem`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ code: upper }),
            });
            const newAnon = resp.anon_id ?? '';
            const newSecret = resp.arena_secret ?? '';
            if (!newAnon || !newSecret) {
                out += bashPrintf(`  %s${L('link.failed', JSON.stringify(resp))}%s\n\n`, DIM, RESET);
                break;
            }
            secretOp = { action: 'save', value: newSecret };
            ensureArena();
            data.stats_share ??= {};
            data.stats_share.anon_id = newAnon;
            data.arena.enabled = true;
            data.arena.enabled_at = now;
            dataChanged = true;
            const trainer = await getJson(`${endpoint}/v1/trainer/${newAnon}`);
            if (trainer !== null) {
                stateOut = applyTrainerToState(input.state, trainer, now);
                stateChanged = true;
                out += bashPrintf(`  %s${L('link.state_synced')}%s\n`, DIM, RESET);
            }
            else {
                out += bashPrintf(`  %s${L('link.no_remote_state')}%s\n`, DIM, RESET);
            }
            out += bashPrintf(`  %s${L('link.success', newAnon)}%s\n\n`, GOLD, RESET);
            break;
        }
        default:
            // live / unknown → bash handles it.
            return null;
    }
    return { data, output: out, dataChanged, secret: secretOp, state: stateOut, stateChanged };
}
//# sourceMappingURL=arena.js.map