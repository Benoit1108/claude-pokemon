// CLI engine adapter (Phase R3b) — the bridge that lets the bash CLI consume
// the TypeScript rules engine instead of its own jq reimplementation.
//
// Bundled (esbuild) into `lib/engine.mjs` and invoked once per tick as
//   node lib/engine.mjs derive   < {json on stdin}   > {json on stdout}
// so the hot statusline path pays a single node spawn, not one per helper.
//
// Scope (R3b): the 6 pure numeric derivations only. Stage/evolution display
// fields (name/emoji/color) stay on the bash side until R3c (views → TS), as
// they live in lib/data.json and aren't carried by the shared engine.
//
// Output contract — multipliers are emitted as fixed-1-decimal STRINGS so the
// bash substitution stays byte-identical to the old printf '%.1f' values
// ("2.0" / "1.2" / "0.5"); the rest are integers.
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { renderView } from './render/index.js';
import { tick } from './tick.js';
import { renderLeaderboard, renderAggregate } from './render/net.js';
import { runConfig } from './config.js';
import { teamToPc, pcToTeamOrActive, releaseSlot, switchCompanion, hatch, ceremonialReset, } from './collection.js';
import { thresholdFor, levelFromXp, xpToNext, progressPct, xpMultiplier, typeMatchMultiplier, } from './index.js';
export function derive(input) {
    const { thresholds, lineage } = input;
    const totalXp = Number(input.total_xp);
    const usedPct = input.used_pct == null ? null : Number(input.used_pct);
    const level = input.level == null ? levelFromXp(thresholds, totalXp) : Number(input.level);
    // pokemon_type_match_mult defaults used_pct to 50 when absent (lib.sh).
    const typeMatch = typeMatchMultiplier(lineage, usedPct == null ? 50 : usedPct);
    return {
        level,
        threshold: thresholdFor(thresholds, level),
        xp_to_next: xpToNext(thresholds, totalXp, level),
        progress_pct: progressPct(thresholds, totalXp, level),
        xp_multiplier: xpMultiplier(usedPct).toFixed(1),
        type_match_mult: typeMatch.toFixed(1),
    };
}
const COMMANDS = {
    derive: (input) => derive(input),
};
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}
// State mutation ops (Phase R3d-2). stdin {op, state, now, args} → stdout
// {ok, state}. ok:false means the op is refused (e.g. team full) — the caller
// shows the appropriate message; null op → exit 3 (bash fallback).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutate(input) {
    const { op, state, now, data } = input;
    const args = Array.isArray(input.args) ? input.args : [];
    switch (op) {
        case 'team_to_pc':
            return { ok: true, state: teamToPc(state, Number(args[0])) };
        case 'release_slot':
            return { ok: true, state: releaseSlot(state, args[0], Number(args[1])) };
        case 'pc_to_team_or_active': {
            const next = pcToTeamOrActive(state, now, Number(args[0]));
            return { ok: next !== null, state: next };
        }
        case 'switch_companion':
            return { ok: true, state: switchCompanion(state, now, Number(args[0])) };
        case 'hatch':
            return { ok: true, state: hatch(state, now, data, args[0] || undefined) };
        case 'ceremonial_reset':
            return { ok: true, state: ceremonialReset(state, now, data) };
        default:
            return null;
    }
}
// Network views (Phase R3d-4): GET the worker + render. Returns the rendered
// string, or null for an unknown view (→ exit 3 → bash fallback).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function net(view, args, input) {
    const data = input.data;
    const locale = input.locale;
    const endpoint = data?.stats_share?.endpoint ?? '';
    const get = async (path) => {
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
    };
    switch (view) {
        case 'leaderboard': {
            const metric = args[0] || 'total_tokens';
            const limit = args[1] || '10';
            return renderLeaderboard(data, locale, metric, await get(`/v1/leaderboard?metric=${metric}&limit=${limit}`));
        }
        case 'aggregate':
            return renderAggregate(data, locale, await get('/v1/aggregate'));
        default:
            return null;
    }
}
async function main() {
    const command = process.argv[2];
    const isRender = command === 'render';
    const isMutate = command === 'mutate';
    const isTick = command === 'tick';
    const isNet = command === 'net';
    const isConfig = command === 'config';
    const handler = command ? COMMANDS[command] : undefined;
    if (!handler && !isRender && !isMutate && !isTick && !isNet && !isConfig) {
        process.stderr.write(`engine: unknown command ${JSON.stringify(command)} (expected: ${[...Object.keys(COMMANDS), 'render', 'mutate', 'tick', 'net', 'config'].join(', ')})\n`);
        process.exit(2);
    }
    const raw = await readStdin();
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        process.stderr.write('engine: invalid JSON on stdin\n');
        process.exit(2);
        return;
    }
    if (isRender) {
        // The positional `render <view>` is authoritative (the documented
        // interface); stdin carries state/data/locale. Fall back to a stdin `view`.
        const inp = input;
        const argView = process.argv[3];
        if (argView)
            inp.view = argView;
        const { supported, output } = renderView(inp);
        // Exit 3 = view not yet ported → the bash dispatcher falls back to its own
        // implementation (graceful degradation, like the derive bridge in R3b).
        if (!supported)
            process.exit(3);
        process.stdout.write(output);
        return;
    }
    if (isMutate) {
        const argOp = process.argv[3];
        const inp = input;
        if (argOp)
            inp.op = argOp;
        const result = mutate(inp);
        if (result === null)
            process.exit(3); // unknown op → bash fallback
        process.stdout.write(JSON.stringify(result));
        return;
    }
    if (isTick) {
        process.stdout.write(JSON.stringify(tick(input)));
        return;
    }
    if (isNet) {
        const view = process.argv[3];
        const out = await net(view, process.argv.slice(4), input);
        if (out === null)
            process.exit(3); // unknown view → bash fallback
        process.stdout.write(out);
        return;
    }
    if (isConfig) {
        const cmd = process.argv[3];
        if (cmd !== 'quote' && cmd !== 'bio' && cmd !== 'pins')
            process.exit(3);
        const inp = input;
        const result = runConfig({
            cmd,
            args: process.argv.slice(4),
            data: inp.data,
            state: inp.state,
            locale: inp.locale,
        });
        process.stdout.write(JSON.stringify(result));
        return;
    }
    process.stdout.write(JSON.stringify(handler(input)));
}
// Run only when executed as a script (the bundled entrypoint), never when
// imported (the vitest parity test imports `derive` directly — main() must not
// fire and block on stdin there).
function invokedAsScript() {
    const entry = process.argv[1];
    if (!entry)
        return false;
    try {
        // Compare REAL paths: the bash bridge builds $POKEMON_ENGINE from a logical
        // pwd, and dotfile managers symlink ~/.claude — a raw URL compare would
        // mismatch and silently disable the engine (every tick falls back to bash).
        return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
    }
    catch {
        return false;
    }
}
if (invokedAsScript()) {
    main().catch((err) => {
        process.stderr.write(`engine: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=cli.js.map