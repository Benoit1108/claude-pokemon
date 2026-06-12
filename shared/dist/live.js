// Live PvP commands (Phase R3d-4b): invite / accept / status / move / forfeit.
// One-shot per subcommand (the user re-runs `status` to refresh — no polling).
// Renders HP/state + the local player's move hints. The move table mirrors the
// worker's STAGE_MOVES (display-only; the worker re-validates).
import { bashPrintf } from './render/printf.js';
import { t } from './render/i18n.js';
import { lineageEmoji } from './render/views.js';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[33m';
// Mirror of _live_stage_for (lib/pokemon-status.sh) — lineage + level → stage.
export function liveStageFor(lin, lvl) {
    const tiers = {
        fire: [[55, 'charizard-megax'], [36, 'charizard'], [16, 'charmeleon'], [1, 'charmander']],
        water: [[55, 'blastoise-mega'], [36, 'blastoise'], [16, 'wartortle'], [1, 'squirtle']],
        grass: [[55, 'venusaur-mega'], [32, 'venusaur'], [16, 'ivysaur'], [1, 'bulbasaur']],
        electric: [[55, 'raichu-alola'], [30, 'raichu'], [10, 'pikachu'], [1, 'pichu']],
        eevee: [[30, 'vaporeon'], [1, 'eevee']],
        chikorita: [[32, 'meganium'], [16, 'bayleef'], [1, 'chikorita']],
        cyndaquil: [[55, 'typhlosion-hisui'], [32, 'typhlosion'], [16, 'quilava'], [1, 'cyndaquil']],
        totodile: [[32, 'feraligatr'], [16, 'croconaw'], [1, 'totodile']],
    };
    const t2 = tiers[lin];
    if (!t2)
        return 'egg';
    for (const [min, id] of t2)
        if (lvl >= min)
            return id;
    return 'egg';
}
// Mirror of _live_moves_for_stage — per-stage 4-move hint list.
const STAGE_MOVES = {
    egg: 'Charge\nMimi-Queue\nRepli\nGrondement',
    charmander: 'Charge\nGriffe\nFlammèche\nGrondement',
    charmeleon: 'Tranche\nFlammèche\nBrouillard\nBrûlure',
    charizard: 'Lance-Flammes\nCru-Aile\nTranche\nMorsure',
    'charizard-megax': 'Dracosouffle\nDamoclès\nLance-Flammes\nTranche',
    'charizard-megay': 'Lance-Soleil\nDéflagration\nCru-Aile\nBélier',
    squirtle: 'Charge\nMimi-Queue\nPistolet à O\nRepli',
    wartortle: 'Pistolet à O\nRepli\nMorsure\nTranche',
    blastoise: "Hydrocanon\nBulles d'O\nTranche\nBélier",
    'blastoise-mega': 'Hydroblast\nVibraqua\nBélier\nDamoclès',
    'blastoise-gmax': 'Hydroblast\nVibraqua\nHydrocanon\nDamoclès',
    bulbasaur: "Charge\nRugissement\nVampigraine\nTranch'Herbe",
    ivysaur: "Tranch'Herbe\nVampigraine\nPoudre Dodo\nBélier",
    venusaur: "Lance-Soleil\nTranch'Herbe\nVampigraine\nBélier",
    'venusaur-mega': 'Lance-Soleil\nVampigraine\nBélier\nSynthèse',
    'venusaur-gmax': 'G-Max Vine Lash\nLance-Soleil\nSynthèse\nVampigraine',
    pichu: 'Charge\nÉclair\nMimi-Queue\nVive-Attaque',
    pikachu: 'Tonnerre\nVive-Attaque\nÉclair\nCharge',
    raichu: "Fatal-Foudre\nCoup d'Jus\nTonnerre\nVive-Attaque",
    'raichu-alola': "Psyko\nTonnerre\nVive-Attaque\nCoup d'Jus",
    'pikachu-gmax': "G-Max Volt Crash\nCataclectric\nTonnerre\nVive-Attaque",
    eevee: 'Charge\nMimi-Queue\nMorsure\nVive-Attaque',
    vaporeon: "Hydrocanon\nVibraqua\nBulles d'O\nMorsure",
    jolteon: "Tonnerre\nVive-Attaque\nCoup d'Jus\nÉclair",
    flareon: 'Lance-Flammes\nCrocs Feu\nRoue de Feu\nMorsure',
    espeon: 'Psyko\nVœu Soin\nVive-Attaque\nMimi-Queue',
    umbreon: "Ball'Ombre\nReflet Magik\nMorsure\nVive-Attaque",
    chikorita: "Charge\nRugissement\nTranch'Herbe\nMimi-Queue",
    bayleef: "Tranch'Herbe\nSynthèse\nVampigraine\nBélier",
    meganium: "Lance-Soleil\nBélier\nSynthèse\nTranch'Herbe",
    cyndaquil: "Charge\nGroz'Yeux\nFlammèche\nBrouillard",
    quilava: 'Roue de Feu\nBrouillard\nFlammèche\nVive-Attaque',
    typhlosion: 'Lance-Flammes\nSurchauffe\nRoue de Feu\nTranche',
    'typhlosion-hisui': "Vortex Infernal\nBall'Ombre\nLance-Flammes\nReflet Magik",
    totodile: 'Charge\nRugissement\nPistolet à O\nMorsure',
    croconaw: 'Morsure\nPistolet à O\nTranche\nVive-Attaque',
    feraligatr: 'Hydrocanon\nMâchouille\nTranche\nBélier',
};
function movesForStage(stage) {
    return STAGE_MOVES[stage] ?? 'Charge\nMimi-Queue\nMorsure\nTranche';
}
// Move names are intentionally hardcoded French (mirrors bash, not t()).
function printMoves(lin, lvl) {
    const moves = movesForStage(liveStageFor(lin, lvl));
    let out = bashPrintf('  %sTes attaques :%s\n', BOLD, RESET);
    for (const m of moves.split('\n'))
        if (m)
            out += bashPrintf('    %s• %s%s\n', GOLD, m, RESET);
    out += bashPrintf('\n  %s/pokemon arena live move "<nom>"%s\n\n', DIM, RESET);
    return out;
}
// Port of _live_render_status — HP/state + (if it's my turn) move hints.
export function renderLiveStatus(resp, me) {
    const state = resp.state ?? '';
    const turnNo = resp.turn_no ?? 0;
    const c = resp.challenger ?? {};
    const d = resp.defender ?? {};
    // No `?? ''` on the anon ids: bash uses bare `jq -r '.challenger.anon_id'`,
    // so a missing id prints `''` here vs the literal `null` bash emits — an
    // intentional, untested-path drift (strictly nicer). Don't add a fallback.
    const cId = c.anon_id;
    const cLin = c.snapshot?.lineage ?? '?';
    const cLvl = c.snapshot?.level ?? 0;
    const cHp = c.hp ?? 0;
    const cPending = c.has_pending_action === true;
    const dId = d.anon_id;
    const dLin = d.snapshot?.lineage ?? '?';
    const dLvl = d.snapshot?.level ?? 0;
    const dHp = d.hp;
    const dPending = d.has_pending_action === true;
    let out = bashPrintf('  %s── Live PvP — état: %s%s · tour %s%s\n', BOLD, GOLD, state, turnNo, RESET);
    out += bashPrintf('  %s%s %s Lv.%s · HP %s · %s%s\n', DIM, lineageEmoji(cLin), cId, cLvl, cHp, cPending ? 'commit ✓' : '... en attente', RESET);
    if (dHp === null || dHp === undefined) {
        out += bashPrintf("  %s%s %s · en attente d'acceptation%s\n\n", DIM, lineageEmoji(dLin), dId, RESET);
    }
    else {
        out += bashPrintf('  %s%s %s Lv.%s · HP %s · %s%s\n\n', DIM, lineageEmoji(dLin), dId, dLvl, dHp, dPending ? 'commit ✓' : '... en attente', RESET);
    }
    if (state === 'finished' || state === 'abandoned') {
        out += bashPrintf('  %s🏁 Combat terminé · winner=%s · reason=%s%s\n\n', GOLD, resp.winner ?? '', resp.reason ?? '', RESET);
        return out;
    }
    if (state === 'active' && me === cId && !cPending)
        out += printMoves(cLin, cLvl);
    else if (state === 'active' && me === dId && !dPending)
        out += printMoves(dLin, dLvl);
    return out;
}
async function jsonFetch(url, init, failable = false) {
    try {
        const r = await fetch(url, init);
        if (failable && !r.ok)
            return null;
        return await r.json();
    }
    catch {
        return null;
    }
}
export async function runLive(input) {
    const { locale, secret } = input;
    const data = JSON.parse(JSON.stringify(input.data));
    const L = (k, ...a) => t(locale, k, ...a);
    const sub = input.args[0] ?? 'status';
    const endpoint = data.stats_share?.endpoint ?? '';
    const webUrl = data.arena?.web_url ?? 'https://claude-pokemon-arena.pages.dev';
    const anonId = data.stats_share?.anon_id ?? '';
    let dataChanged = false;
    let out = '';
    const lastId = () => data.arena?.last_live_battle_id ?? '';
    const setLast = (id) => {
        data.arena ??= {};
        data.arena.last_live_battle_id = id;
        dataChanged = true;
    };
    const spectator = (id) => {
        out += bashPrintf(`  %s${L('live.spectator_url', webUrl, id)}%s\n\n`, DIM, RESET);
    };
    const msg = (k, color, ...a) => {
        out += bashPrintf(`\n  %s${L(k, ...a)}%s\n\n`, color, RESET);
    };
    switch (sub) {
        case 'invite': {
            const opp = input.args[1] ?? '';
            if (!opp) {
                msg('live.invite_usage', DIM);
                break;
            }
            const resp = (await jsonFetch(`${endpoint}/v1/arena/live/invite`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
                body: JSON.stringify({ challenger_anon_id: anonId, defender_anon_id: opp }),
            })) ?? {};
            const id = resp.battle_id ?? '';
            if (!id) {
                msg('live.invite_failed', DIM, JSON.stringify(resp));
                break;
            }
            setLast(id);
            out += bashPrintf(`\n  %s${L('live.invite_sent', opp, id)}%s\n`, GOLD, RESET);
            out += bashPrintf(`  %s${L('live.spectator_url', webUrl, id)}%s\n\n`, DIM, RESET);
            break;
        }
        case 'accept': {
            const id = input.args[1] || lastId();
            if (!id) {
                msg('live.accept_usage', DIM);
                break;
            }
            const resp = (await jsonFetch(`${endpoint}/v1/arena/live/${id}/accept`, {
                method: 'POST',
                headers: { authorization: `Bearer ${secret}` },
            })) ?? {};
            if (resp.state !== 'active') {
                msg('live.accept_failed', DIM, JSON.stringify(resp));
                break;
            }
            setLast(id);
            out += bashPrintf(`\n  %s${L('live.accepted', id)}%s\n\n`, GOLD, RESET);
            const status = await jsonFetch(`${endpoint}/v1/arena/live/${id}`, undefined, true);
            if (status !== null) {
                out += renderLiveStatus(status, anonId);
                spectator(id);
            }
            else {
                out += bashPrintf(`\n  %s${L('live.not_found', id)}%s\n\n`, DIM, RESET);
            }
            break;
        }
        case 'status':
        case '': {
            const id = input.args[1] || lastId();
            if (!id) {
                msg('live.status_usage', DIM);
                break;
            }
            const resp = await jsonFetch(`${endpoint}/v1/arena/live/${id}`, undefined, true);
            if (resp === null) {
                msg('live.not_found', DIM, id);
                break;
            }
            out += renderLiveStatus(resp, anonId);
            spectator(id);
            break;
        }
        case 'move':
        case 'attack': {
            const name = input.args[1] ?? '';
            const id = lastId();
            if (!id) {
                msg('live.move_no_battle', DIM);
                break;
            }
            if (!name) {
                msg('live.move_usage', DIM);
                break;
            }
            const resp = (await jsonFetch(`${endpoint}/v1/arena/live/${id}/commit`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
                body: JSON.stringify({ anon_id: anonId, move_id: name }),
            })) ?? {};
            if (resp.error) {
                msg('live.move_failed', DIM, resp.error);
                break;
            }
            out += bashPrintf(`\n  %s${L('live.move_committed', name)}%s\n\n`, GOLD, RESET);
            out += renderLiveStatus(resp, anonId);
            spectator(id);
            break;
        }
        case 'forfeit':
        case 'abandon': {
            const id = input.args[1] || lastId();
            if (!id) {
                msg('live.forfeit_usage', DIM);
                break;
            }
            const resp = (await jsonFetch(`${endpoint}/v1/arena/live/${id}/forfeit`, {
                method: 'POST',
                headers: { authorization: `Bearer ${secret}` },
            })) ?? {};
            msg('live.forfeited', DIM, resp.state ?? '');
            break;
        }
        default:
            msg('live.unknown_subcmd', DIM, sub);
    }
    return { data, output: out, dataChanged };
}
//# sourceMappingURL=live.js.map