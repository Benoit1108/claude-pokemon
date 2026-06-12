// Native Node /pokemon dispatcher (Phase R3d-5). Replaces the pokemon-status.sh
// dispatch + all its engine bridges (_render_view_live / _cmd / _arena / _share
// / _config / _render_net / _login / _logout): reads data/state/locale, routes
// each subcommand to the engine IN-PROCESS, applies the data/state/secret/
// session ops to disk, and prints the output. Bundled to lib/pokemon.mjs.
//
// State/data writes are atomic (tmp + rename); no flock (the /pokemon commands
// are rare + sequential — the tick path keeps its own lock in statusline). Bash
// pokemon-status.sh stays the registered command until this is proven byte-exact
// and the switch is flipped (Phase R3d-5 piece 5).
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { renderView } from './render/index.js';
import { renderLeaderboard, renderAggregate } from './render/net.js';
import { runCommand } from './commands.js';
import { runConfig } from './config.js';
import { runShare, buildSubmitPayload, renderForget, renderSubmit } from './share.js';
import { runArena } from './arena.js';
import { runLogin, runLogout } from './auth.js';
import { evoField } from './render/views.js';
const POKEMON_DIR = process.env.POKEMON_DIR || join(homedir(), '.claude', 'pokemon');
const DATA_PATH = join(POKEMON_DIR, 'data.json');
const STATE_PATH = join(POKEMON_DIR, 'state.json');
const SECRET_FILE = join(POKEMON_DIR, '.arena-secret');
const SESSION_FILE = join(POKEMON_DIR, '.session');
function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return {};
    }
}
function writeJsonAtomic(path, obj) {
    writeFileSync(path + '.tmp', JSON.stringify(obj) + '\n');
    renameSync(path + '.tmp', path);
}
function readText(path) {
    try {
        return readFileSync(path, 'utf8');
    }
    catch {
        return '';
    }
}
function writeSecretFile(path, value) {
    writeFileSync(path, value, { mode: 0o600 });
}
function rm(path) {
    try {
        unlinkSync(path);
    }
    catch {
        // already gone
    }
}
const out = (s) => {
    process.stdout.write(s);
};
// POKEMON_NOW_EPOCH is a test seam (mirrors the bash `date` shim); unset → real.
const nowEpoch = process.env.POKEMON_NOW_EPOCH ? Number(process.env.POKEMON_NOW_EPOCH) : Math.floor(Date.now() / 1000);
const nowIso = new Date(nowEpoch * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
async function getJson(endpoint, path) {
    if (!endpoint)
        return { endpoint: false };
    try {
        const r = await fetch(`${endpoint}${path}`);
        if (!r.ok)
            return { fetchFailed: true };
        return { resp: await r.json() };
    }
    catch {
        return { fetchFailed: true };
    }
}
// Inject randomness for trade/game (the "decisions in" pattern), forced
// deterministic by single-entry pools in tests.
function lengthOf(x) {
    if (Array.isArray(x))
        return x.length;
    if (x && typeof x === 'object')
        return Object.keys(x).length;
    return 0;
}
function cmdDecisions(data) {
    const pool = lengthOf(data.wild_pool) || 1;
    return {
        pool_idx: Math.floor(Math.random() * pool),
        trade_level: Math.floor(Math.random() * 46) + 5,
        trade_shiny: Math.floor(Math.random() * 20) === 0,
    };
}
async function main() {
    const argv = process.argv.slice(2);
    const sub = argv[0] ?? '';
    const rest = argv.slice(1);
    const data = readJson(DATA_PATH);
    const state = readJson(STATE_PATH);
    const lang = data.language ?? 'fr';
    let localePath = join(POKEMON_DIR, 'locales', `${lang}.json`);
    let locale;
    try {
        locale = JSON.parse(readFileSync(localePath, 'utf8'));
    }
    catch {
        localePath = join(POKEMON_DIR, 'locales', 'fr.json');
        locale = readJson(localePath);
    }
    // ── render views (no state change) ─────────────────────────────────────────
    const renderViews = {
        team: 'team', pc: 'pc', storage: 'pc', pokedex: 'pokedex', dex: 'pokedex',
        stats: 'stats', lifetime: 'stats', badges: 'badges', inventory: 'inventory',
        inv: 'inventory', sac: 'inventory', 'trainer-card': 'trainer-card', card: 'trainer-card',
    };
    if (sub in renderViews || sub === '' || !KNOWN.has(sub)) {
        const view = renderViews[sub] ?? 'main';
        let sprite = null;
        if (view === 'main') {
            const lineage = state.lineage ?? 'fire';
            const showdownId = evoField(data, state, lineage, Number(state.current_level), 'showdown_id');
            const variant = state.is_shiny === true ? 'shiny' : 'normal';
            const content = readText(join(POKEMON_DIR, 'sprites', variant, `${showdownId}.txt`));
            if (content) {
                const lines = content.split('\n');
                if (lines.length && lines[lines.length - 1] === '')
                    lines.pop();
                sprite = lines;
            }
        }
        const { output } = renderView({ view, state, data, locale, lang, scriptName: 'pokemon-status.sh', nowEpoch, sprite });
        out(output);
        // Ack the one-time XP-rebalance notice (mirrors view_main: it writes the
        // flag while rendering). The engine render is pure, so the entrypoint
        // persists it — else the notice would re-fire every /pokemon.
        if (view === 'main' && Number(state.total_xp ?? 0) >= 1000 && state.xp_rebalance_v2_acknowledged !== true) {
            state.xp_rebalance_v2_acknowledged = true;
            writeJsonAtomic(STATE_PATH, state);
        }
        return;
    }
    if (sub === 'recap' || sub === 'summary') {
        const { output } = renderView({ view: 'recap', state, data, locale, lang, scriptName: 'pokemon-status.sh', nowEpoch, scope: rest[0] || 'session' });
        out(output);
        return;
    }
    // ── mutating commands via the engine `cmd` runner ──────────────────────────
    const cmdMap = {
        '--shiny': 'shiny', reset: 'reset', switch: 'switch', hatch: 'hatch',
        deposit: 'deposit', withdraw: 'withdraw', release: 'release', give: 'give', take: 'take',
        trade: 'trade', game: 'game',
    };
    if (sub in cmdMap) {
        const name = cmdMap[sub];
        const res = runCommand({ name, args: rest, state, data, locale, now: nowIso, nowEpoch, decisions: cmdDecisions(data) });
        if (res) {
            if (res.stateChanged)
                writeJsonAtomic(STATE_PATH, res.state);
            out(res.output);
            return;
        }
    }
    // ── config (quote / bio / pins) ────────────────────────────────────────────
    if (sub === 'quote' || sub === 'bio' || sub === 'pins' || sub === 'pinned') {
        const cmd = sub === 'pinned' ? 'pins' : sub;
        const res = runConfig({ cmd, args: rest, data, state, locale });
        if (res.changed)
            writeJsonAtomic(DATA_PATH, res.data);
        out(res.output);
        return;
    }
    // ── network views (leaderboard / aggregate) ────────────────────────────────
    if (sub === 'leaderboard' || sub === 'lb') {
        const endpoint = data?.stats_share?.endpoint ?? '';
        const metric = rest[0] || 'total_tokens';
        const limit = rest[1] || '10';
        out(renderLeaderboard(data, locale, metric, await getJson(endpoint, `/v1/leaderboard?metric=${metric}&limit=${limit}`)));
        return;
    }
    if (sub === 'aggregate' || sub === 'global') {
        const endpoint = data?.stats_share?.endpoint ?? '';
        out(renderAggregate(data, locale, await getJson(endpoint, '/v1/aggregate')));
        return;
    }
    // ── stats-share (status/enable/disable/name/forget/submit) ─────────────────
    if (sub === 'stats-share' || sub === 'share') {
        const shareSub = rest[0] ?? '';
        const endpoint = data?.stats_share?.endpoint ?? '';
        if (shareSub === 'forget') {
            const anonId = data?.stats_share?.anon_id ?? '';
            let ok = false;
            if (anonId && endpoint) {
                try {
                    const r = await fetch(`${endpoint}/v1/forget?anon_id=${anonId}`, { method: 'DELETE' });
                    ok = r.ok && (await r.text()).length > 0;
                }
                catch {
                    ok = false;
                }
            }
            const res = renderForget(data, locale, anonId, ok);
            if (res.changed)
                writeJsonAtomic(DATA_PATH, res.data);
            out(res.output);
            return;
        }
        if (shareSub === 'submit' || shareSub === 'push') {
            const enabled = data?.stats_share?.enabled === true;
            let code = 0;
            let cooldownS = 0;
            if (enabled && endpoint) {
                const payload = buildSubmitPayload(data, state, data.stats_share.anon_id ?? '', data.version ?? 'unknown', data.stats_share.display_name ?? '', nowIso);
                try {
                    const r = await fetch(`${endpoint}/v1/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
                    code = r.status;
                    if (code === 429) {
                        try {
                            cooldownS = (await r.json()).cooldown_remaining_s ?? 0;
                        }
                        catch {
                            cooldownS = 0;
                        }
                    }
                }
                catch {
                    code = 0;
                }
            }
            const res = renderSubmit(state, locale, enabled, code, cooldownS, nowIso);
            if (res.changed)
                writeJsonAtomic(STATE_PATH, res.state);
            out(res.output);
            return;
        }
        const res = runShare({ args: rest, data, locale, anonId: randomBytes(4).toString('hex') });
        if (res) {
            if (res.changed)
                writeJsonAtomic(DATA_PATH, res.data);
            out(res.output);
            return;
        }
    }
    // ── arena (status/enable/.../pair/link/live) ───────────────────────────────
    if (sub === 'arena') {
        const res = await runArena({ args: rest, data, state, locale, arenaSecret: readText(SECRET_FILE), now: nowIso });
        if (res) {
            if (res.dataChanged)
                writeJsonAtomic(DATA_PATH, res.data);
            if (res.stateChanged)
                writeJsonAtomic(STATE_PATH, res.state);
            if (res.secret?.action === 'save')
                writeSecretFile(SECRET_FILE, res.secret.value);
            else if (res.secret?.action === 'clear')
                rm(SECRET_FILE);
            out(res.output);
            return;
        }
    }
    // ── auth (login / logout) ──────────────────────────────────────────────────
    if (sub === 'login') {
        const endpoint = data?.stats_share?.endpoint ?? '';
        const clientId = process.env.POKEMON_GITHUB_CLIENT_ID || 'Ov23liiZGFKFIT78EDcz';
        const { sessionToken } = await runLogin({ endpoint, clientId }, { write: (s) => process.stderr.write(s), sleep: (sec) => new Promise((r) => setTimeout(r, sec * 1000)), now: () => Math.floor(Date.now() / 1000) });
        if (sessionToken)
            writeSecretFile(SESSION_FILE, sessionToken);
        else
            process.exitCode = 1;
        return;
    }
    if (sub === 'logout') {
        const endpoint = data?.stats_share?.endpoint ?? '';
        const res = await runLogout({ endpoint, token: readText(SESSION_FILE) });
        if (res.session?.action === 'clear')
            rm(SESSION_FILE);
        out(res.output);
        return;
    }
    // Unknown → main view (matches the bash default).
    const { output } = renderView({ view: 'main', state, data, locale, lang, scriptName: 'pokemon-status.sh', nowEpoch });
    out(output);
}
// Subcommands handled below the render-view branch — anything NOT here falls to
// the `main` view (the bash `*)` default).
const KNOWN = new Set([
    '--shiny', 'reset', 'switch', 'hatch', 'deposit', 'withdraw', 'release', 'give', 'take',
    'trade', 'game', 'recap', 'summary', 'quote', 'bio', 'pins', 'pinned',
    'leaderboard', 'lb', 'aggregate', 'global', 'stats-share', 'share', 'arena', 'login', 'logout',
    'team', 'pc', 'storage', 'pokedex', 'dex', 'stats', 'lifetime', 'badges', 'inventory', 'inv', 'sac',
    'trainer-card', 'card',
]);
void main();
//# sourceMappingURL=pokemon-entry.js.map