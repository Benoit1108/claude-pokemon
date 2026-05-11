// Pure deterministic battle resolution.
// No I/O, no KV — given the same inputs (participants + seed), always returns
// the same BattleResult. This is what makes battles replayable on /battle/[id]:
// the persistence layer stores only the seed + snapshots, and the frontend
// can re-derive the full turn log if it ever needs to.
import { ARENA_MAX_TURNS, LINEAGE_TO_TYPE, } from './types.js';
// Effectiveness multiplier when `attacker` hits `defender`.
// Fire > Grass > Water > Fire (rock-paper-scissors). Electric > Water,
// resisted by Grass. Normal (eevee) is neutral both ways.
export const TYPE_CHART = {
    fire: { fire: 0.5, water: 0.5, grass: 2.0, electric: 1.0, normal: 1.0 },
    water: { fire: 2.0, water: 0.5, grass: 0.5, electric: 1.0, normal: 1.0 },
    grass: { fire: 0.5, water: 2.0, grass: 0.5, electric: 1.0, normal: 1.0 },
    electric: { fire: 1.0, water: 2.0, grass: 0.5, electric: 0.5, normal: 1.0 },
    normal: { fire: 1.0, water: 1.0, grass: 1.0, electric: 1.0, normal: 1.0 },
};
// Stat derivation from level (no per-species curves yet — keeps things simple
// and prevents power-creep when we add more starters).
export function maxHp(level, isShiny) {
    const base = 50 + level * 2;
    return Math.round(base * (isShiny ? 1.05 : 1));
}
export function attackPower(level, isShiny) {
    const base = 10 + level;
    return Math.round(base * (isShiny ? 1.05 : 1));
}
// mulberry32 — small, fast, decent-quality 32-bit PRNG. Deterministic from
// a single uint32 seed, so battles replay identically across runs/platforms.
export function mulberry32(seed) {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// FNV-1a hash → uint32. Used to derive a seed from a battle_id string when
// the caller doesn't have a numeric seed handy.
export function hashSeed(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
function buildCombatant(side, p) {
    return {
        side,
        participant: p,
        hp: maxHp(p.level, p.is_shiny),
        maxHp: maxHp(p.level, p.is_shiny),
        attack: attackPower(p.level, p.is_shiny),
        type: LINEAGE_TO_TYPE[p.lineage],
    };
}
// Damage formula : attack × effectiveness × ±15% variance, ÷4 to scale to
// HP pool, then crit (6.25%, ×1.5). Floor at 1 so a turn always advances.
function rollDamage(attacker, defender, rng) {
    const effectiveness = TYPE_CHART[attacker.type][defender.type];
    const variance = 0.85 + rng() * 0.3; // 0.85..1.15
    const critRoll = rng();
    const critical = critRoll < 0.0625;
    const critMult = critical ? 1.5 : 1;
    const raw = (attacker.attack * effectiveness * variance * critMult) / 4;
    return { damage: Math.max(1, Math.round(raw)), effectiveness, critical };
}
/**
 * Resolve a battle deterministically.
 *
 * Turn order : higher level first; tie broken by a single rng() coin flip.
 * Battle ends when a side reaches 0 HP, or after ARENA_MAX_TURNS — in which
 * case the higher HP% wins (draw if equal).
 */
export function resolveBattle(args) {
    const rng = mulberry32(args.seed);
    const C = buildCombatant('challenger', args.challenger);
    const D = buildCombatant('defender', args.defender);
    let firstAttacker;
    let secondAttacker;
    if (C.participant.level > D.participant.level) {
        firstAttacker = C;
        secondAttacker = D;
    }
    else if (D.participant.level > C.participant.level) {
        firstAttacker = D;
        secondAttacker = C;
    }
    else {
        // tie → seeded coin flip
        if (rng() < 0.5) {
            firstAttacker = C;
            secondAttacker = D;
        }
        else {
            firstAttacker = D;
            secondAttacker = C;
        }
    }
    const turns = [];
    let turnNum = 0;
    let winner = 'draw';
    let reason = 'turn_limit';
    while (turnNum < ARENA_MAX_TURNS) {
        for (const [attacker, defender] of [
            [firstAttacker, secondAttacker],
            [secondAttacker, firstAttacker],
        ]) {
            if (attacker.hp <= 0 || defender.hp <= 0)
                continue;
            turnNum++;
            const { damage, effectiveness, critical } = rollDamage(attacker, defender, rng);
            defender.hp = Math.max(0, defender.hp - damage);
            turns.push({
                turn: turnNum,
                actor: attacker.side,
                damage,
                effectiveness,
                critical,
                defender_hp_after: defender.hp,
            });
            if (defender.hp <= 0) {
                winner = attacker.side;
                reason = 'ko';
                break;
            }
            if (turnNum >= ARENA_MAX_TURNS)
                break;
        }
        if (reason === 'ko')
            break;
    }
    if (reason === 'turn_limit') {
        const challengerPct = C.hp / C.maxHp;
        const defenderPct = D.hp / D.maxHp;
        if (challengerPct > defenderPct)
            winner = 'challenger';
        else if (defenderPct > challengerPct)
            winner = 'defender';
        else
            winner = 'draw';
    }
    return {
        battle_id: null,
        challenger: args.challenger,
        defender: args.defender,
        seed: args.seed,
        turns,
        winner,
        reason,
        created_at: args.createdAt,
    };
}
/**
 * Derive a side's current HP at the end of a turn slice.
 *
 * The BattleTurn shape carries `defender_hp_after` (the HP of the SIDE BEING
 * HIT after that turn). To reconstruct HP for either combatant during replay
 * we walk the turns and snapshot the last value where that side was hit.
 *
 *   - actor === 'challenger' → defender side took damage → that turn updates
 *     the DEFENDER's HP.
 *   - actor === 'defender' → challenger side took damage → that turn updates
 *     the CHALLENGER's HP.
 *
 * Returns max when no turns provided (battle just started).
 */
export function deriveHpFromTurns(side, turns, max) {
    if (!turns || turns.length === 0)
        return max;
    let hp = max;
    for (const t of turns) {
        const sideHit = t.actor === 'challenger' ? 'defender' : 'challenger';
        if (sideHit === side)
            hp = t.defender_hp_after;
    }
    return hp;
}
//# sourceMappingURL=battle.js.map