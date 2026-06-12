// Mutating CLI commands (Phase R3d-4b). These port the bash view_* wrappers
// that validate args, apply a collection transform (already in collection.ts),
// and render a result message — byte-identical to the bash. The state mutation
// itself was already shared; what moves here is the title/validation/messages,
// so the Node entrypoint (R3d-5) can dispatch them without bash.
//
// Contract: stdin {state, data, locale, now, args} → stdout {output, state,
// stateChanged}. Unknown command → null (→ exit 3 → bash fallback). bash writes
// the returned state (guarded) under flock and prints the output.
import { bashPrintf } from './render/printf.js';
import { t } from './render/i18n.js';
import { teamToPc, pcToTeamOrActive, releaseSlot } from './collection.js';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[33m';
function maxStage(entry) {
    return entry?.max_stage ?? 'Œuf';
}
function cmdDeposit(input) {
    const { state, locale } = input;
    const L = (k, ...a) => t(locale, k, ...a);
    let out = bashPrintf(`\n  %s%s${L('deposit.title')}%s\n\n`, BOLD, GOLD, RESET);
    const slotArg = input.args[0] ?? '';
    if (slotArg === '')
        return { output: out + bashPrintf(`  %s${L('deposit.usage')}%s\n\n`, DIM, RESET), state, stateChanged: false };
    const team = state.team ?? [];
    if (team.length === 0)
        return { output: out + bashPrintf(`  %s${L('deposit.no_team')}%s\n\n`, DIM, RESET), state, stateChanged: false };
    const slot = Number(slotArg);
    if (slot >= team.length || slot < 0) {
        return { output: out + bashPrintf(`  %s${L('switch.out_of_range', team.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false };
    }
    const name = maxStage(team[slot]);
    const next = teamToPc(state, slot);
    out += bashPrintf(`  %s${L('deposit.success', name)}%s\n\n`, BOLD, RESET);
    return { output: out, state: next, stateChanged: true };
}
function cmdWithdraw(input) {
    const { state, locale, now } = input;
    const L = (k, ...a) => t(locale, k, ...a);
    let out = bashPrintf(`\n  %s%s${L('withdraw.title')}%s\n\n`, BOLD, GOLD, RESET);
    const slotArg = input.args[0] ?? '';
    if (slotArg === '')
        return { output: out + bashPrintf(`  %s${L('withdraw.usage')}%s\n\n`, DIM, RESET), state, stateChanged: false };
    const pc = state.pc_storage ?? [];
    if (pc.length === 0)
        return { output: out + bashPrintf(`  %s${L('withdraw.no_pc')}%s\n\n`, DIM, RESET), state, stateChanged: false };
    const slot = Number(slotArg);
    if (slot >= pc.length || slot < 0) {
        return { output: out + bashPrintf(`  %s${L('switch.out_of_range', pc.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false };
    }
    const name = maxStage(pc[slot]);
    const next = pcToTeamOrActive(state, now, slot);
    if (next === null) {
        return { output: out + bashPrintf(`  %s${L('withdraw.team_full')}%s\n\n`, DIM, RESET), state, stateChanged: false };
    }
    out += bashPrintf(`  %s${L('withdraw.success', name)}%s\n\n`, BOLD, RESET);
    return { output: out, state: next, stateChanged: true };
}
function cmdRelease(input) {
    const { state, locale } = input;
    const L = (k, ...a) => t(locale, k, ...a);
    let out = bashPrintf(`\n  %s%s${L('release.title')}%s\n\n`, BOLD, GOLD, RESET);
    const area = input.args[0] ?? '';
    const slotArg = input.args[1] ?? '';
    const confirm = input.args[2] ?? '';
    const usage = () => ({ output: out + bashPrintf(`  %s${L('release.usage')}%s\n\n`, DIM, RESET), state, stateChanged: false });
    if (area === '' || slotArg === '')
        return usage();
    if (area !== 'team' && area !== 'pc')
        return usage();
    const field = area === 'team' ? 'team' : 'pc_storage';
    const list = state[field] ?? [];
    if (list.length === 0) {
        const key = area === 'team' ? 'team.empty' : 'pc.empty';
        return { output: out + bashPrintf(`  %s${L(key)}%s\n\n`, DIM, RESET), state, stateChanged: false };
    }
    const slot = Number(slotArg);
    if (slot >= list.length || slot < 0) {
        return { output: out + bashPrintf(`  %s${L('switch.out_of_range', list.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false };
    }
    const name = maxStage(list[slot]);
    if (confirm !== '--confirm') {
        out += bashPrintf(`  %s${L('release.confirm_required')}%s\n`, DIM, RESET);
        // "Cible :" is hardcoded French in the bash (not pokemon_t) — keep verbatim.
        out += bashPrintf('  %sCible : %s%s%s (slot %d)%s\n\n', DIM, BOLD, name, RESET, slot, RESET);
        return { output: out, state, stateChanged: false };
    }
    const next = releaseSlot(state, area, slot);
    out += bashPrintf(`  %s${L('release.released', name)}%s\n\n`, BOLD, RESET);
    return { output: out, state: next, stateChanged: true };
}
export function runCommand(input) {
    switch (input.name) {
        case 'deposit':
            return cmdDeposit(input);
        case 'withdraw':
            return cmdWithdraw(input);
        case 'release':
            return cmdRelease(input);
        default:
            return null;
    }
}
//# sourceMappingURL=commands.js.map