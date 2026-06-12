// stats-share config subcommands (Phase R3d-4b): status / enable / disable /
// name. Pure: (data, locale, args, anonId) → { data, output, changed }. The
// `share` engine command supplies anonId (crypto) for enable; the network
// subcommands (forget / submit) stay bash for now → the command returns null
// for them so the dispatcher falls back.
import { bashPrintf } from './render/printf.js';
import { t } from './render/i18n.js';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[33m';
const NAME_RE = /^[a-zA-Z0-9_-]{2,24}$/;
// ── Network subcommands (forget / submit) ───────────────────────────────────
// The fetch happens in the `share` command (Node); these render + mutate given
// the result, so they stay pure/testable.
// Port of _share_build_payload (lib/pokemon-status.sh): the strict submit
// whitelist from data.stats_share + state.
export function buildSubmitPayload(data, state, anonId, clientVer, displayName, now) {
    const share = data.stats_share ?? {};
    const ls = state.lifetime_stats ?? {};
    const orNull = (v) => (v === '' ? null : v);
    return {
        anon_id: anonId,
        display_name: orNull(displayName),
        quote: orNull(share.quote ?? ''),
        bio: orNull(share.bio ?? ''),
        pinned_badges: share.pinned_badges ?? [],
        schema_version: 1,
        client_version: clientVer,
        submitted_at: now,
        stats: {
            lifetime: {
                total_tokens: ls.total_tokens ?? 0,
                total_evolutions: ls.total_evolutions ?? 0,
                total_shinies: ls.total_shinies ?? 0,
                max_level: ls.max_level ?? 0,
                total_compagnons: ls.total_compagnons ?? 0,
                lineages_completed: ls.lineages_completed ?? [],
                games_won: ls.games_won ?? 0,
                games_played: ls.games_played ?? 0,
            },
            active: {
                lineage: state.lineage ?? null,
                current_level: state.current_level ?? 0,
                is_shiny: state.is_shiny ?? false,
            },
            badges: (state.badges ?? []).map((b) => b.id),
            pokedex_seen_count: Object.keys(state.pokedex_wild ?? {}).length,
            pokedex_seen_ids: Object.keys(state.pokedex_wild ?? {}),
        },
    };
}
const SHARE_RESET = '\x1b[0m';
const SHARE_BOLD = '\x1b[1m';
const SHARE_DIM = '\x1b[2m';
const SHARE_GOLD = '\x1b[33m';
const shareTitle = (locale) => bashPrintf(`\n  %s%s${t(locale, 'share.title')}%s\n\n`, SHARE_BOLD, SHARE_GOLD, SHARE_RESET);
// forget: the command fetches DELETE /v1/forget?anon_id; ok = success.
export function renderForget(data, locale, anonId, ok) {
    const d = JSON.parse(JSON.stringify(data));
    let out = shareTitle(locale);
    let changed = false;
    if (!anonId) {
        out += bashPrintf(`  %s${t(locale, 'share.no_id')}%s\n\n`, SHARE_DIM, SHARE_RESET);
    }
    else if (ok) {
        d.stats_share ??= {};
        d.stats_share.enabled = false;
        d.stats_share.anon_id = null;
        changed = true;
        out += bashPrintf(`  %s${t(locale, 'share.forgotten', anonId)}%s\n\n`, SHARE_GOLD, SHARE_RESET);
    }
    else {
        out += bashPrintf(`  %s${t(locale, 'share.forget_failed')}%s\n\n`, SHARE_DIM, SHARE_RESET);
    }
    return { data: d, output: out, changed };
}
// submit: the command fetches POST /v1/submit; code = HTTP status.
export function renderSubmit(state, locale, enabled, code, cooldownS, now) {
    const s = JSON.parse(JSON.stringify(state));
    let out = shareTitle(locale);
    let changed = false;
    if (!enabled) {
        out += bashPrintf(`  %s${t(locale, 'share.not_enabled')}%s\n\n`, SHARE_DIM, SHARE_RESET);
    }
    else if (code === 200) {
        s.last_stats_submit_at = now;
        changed = true;
        out += bashPrintf(`  %s${t(locale, 'share.submit_ok')}%s\n\n`, SHARE_GOLD, SHARE_RESET);
    }
    else if (code === 429) {
        out += bashPrintf(`  %s${t(locale, 'share.cooldown', Math.floor(cooldownS / 3600))}%s\n\n`, SHARE_DIM, SHARE_RESET);
    }
    else {
        out += bashPrintf(`  %s${t(locale, 'share.submit_failed', code)}%s\n\n`, SHARE_DIM, SHARE_RESET);
    }
    return { state: s, output: out, changed };
}
/** Returns null for subcommands the engine doesn't own (forget/submit/unknown)
 *  → the bash dispatcher falls back. */
export function runShare(input) {
    const { args, locale, anonId } = input;
    const data = JSON.parse(JSON.stringify(input.data));
    const L = (k, ...a) => t(locale, k, ...a);
    const sub = args[0] ?? '';
    const share = data.stats_share ?? {};
    const enabled = share.enabled === true;
    const endpoint = share.endpoint ?? '';
    const anonCur = share.anon_id ?? '';
    const displayName = share.display_name ?? '';
    let changed = false;
    const ensure = () => (data.stats_share ??= {});
    let out = bashPrintf(`\n  %s%s${L('share.title')}%s\n\n`, BOLD, GOLD, RESET);
    switch (sub) {
        case 'enable':
        case 'on': {
            if (enabled) {
                out += bashPrintf(`  %s${L('share.already_enabled')}%s\n\n`, DIM, RESET);
                out += bashPrintf('  %s%s%s\n\n', DIM, `anon_id : ${anonCur}`, RESET);
                break;
            }
            if (args[1] !== '--confirm') {
                out += bashPrintf(`  %s${L('share.privacy_notice')}%s\n\n`, DIM, RESET);
                out += bashPrintf(`  %s${L('share.confirm_hint')}%s\n\n`, BOLD, RESET);
                break;
            }
            ensure().enabled = true;
            data.stats_share.anon_id = anonId;
            changed = true;
            out += bashPrintf(`  %s${L('share.enabled', anonId)}%s\n\n`, GOLD, RESET);
            break;
        }
        case 'disable':
        case 'off': {
            if (!enabled) {
                out += bashPrintf(`  %s${L('share.already_disabled')}%s\n\n`, DIM, RESET);
                break;
            }
            ensure().enabled = false;
            changed = true;
            out += bashPrintf(`  %s${L('share.disabled')}%s\n\n`, DIM, RESET);
            out += bashPrintf(`  %s${L('share.disable_hint')}%s\n\n`, DIM, RESET);
            break;
        }
        case 'name':
        case 'pseudo': {
            const newName = args[1] ?? '';
            if (newName === '') {
                out += displayName
                    ? bashPrintf(`  %s${L('share.name_current', displayName)}%s\n\n`, GOLD, RESET)
                    : bashPrintf(`  %s${L('share.name_unset')}%s\n\n`, DIM, RESET);
                out += bashPrintf(`  %s${L('share.name_usage')}%s\n\n`, DIM, RESET);
                break;
            }
            if (newName === 'clear' || newName === 'remove') {
                ensure().display_name = null;
                changed = true;
                out += bashPrintf(`  %s${L('share.name_cleared')}%s\n\n`, DIM, RESET);
                break;
            }
            if (!NAME_RE.test(newName)) {
                out += bashPrintf(`  %s${L('share.name_invalid')}%s\n\n`, DIM, RESET);
                break;
            }
            ensure().display_name = newName;
            changed = true;
            out += bashPrintf(`  %s${L('share.name_set', newName)}%s\n\n`, GOLD, RESET);
            out += bashPrintf(`  %s${L('share.name_set_hint')}%s\n\n`, DIM, RESET);
            break;
        }
        case 'status':
        case '': {
            if (enabled) {
                out += bashPrintf(`  %s${L('share.status_enabled', anonCur)}%s\n`, GOLD, RESET);
                out += displayName
                    ? bashPrintf(`  %s${L('share.status_pseudo', displayName)}%s\n`, GOLD, RESET)
                    : bashPrintf(`  %s${L('share.status_no_pseudo')}%s\n`, DIM, RESET);
                out += bashPrintf(`  %s${L('share.status_endpoint', endpoint)}%s\n\n`, DIM, RESET);
            }
            else {
                out += bashPrintf(`  %s${L('share.status_disabled')}%s\n\n`, DIM, RESET);
            }
            out += bashPrintf(`  %s${L('share.usage')}%s\n\n`, DIM, RESET);
            break;
        }
        default:
            // forget / submit (network) / unknown → bash handles it.
            return null;
    }
    return { data, output: out, changed };
}
//# sourceMappingURL=share.js.map