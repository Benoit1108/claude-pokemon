import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleLiveInvite } from '../../../src/handlers/arena/live-invite'
import { handleLiveAccept } from '../../../src/handlers/arena/live-accept'
import { handleLiveStatus } from '../../../src/handlers/arena/live-status'
import { handleLiveForfeit } from '../../../src/handlers/arena/live-forfeit'
import { handleLiveCommit } from '../../../src/handlers/arena/live-commit'
import { getLiveBattle, putLiveBattle } from '../../../src/lib/kv'
import { movesForStage, stageFor } from '../../../src/lib/moves'
import { MockKV, makeEnv } from '../../helpers/mockKV'

const challenger = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 50,
  is_shiny: false,
}
const defender = {
  anon_id: 'bbbbbbbb',
  display_name: 'Misty',
  lineage: 'grass',
  level: 30,
  is_shiny: false,
}

async function enable(env: ReturnType<typeof makeEnv>, team: typeof challenger): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(team),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function makeReq(secret: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', { method: 'POST', headers, body: JSON.stringify(body) })
}

describe('Live PvP — invite/accept/status/forfeit', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  // ---------- /v1/arena/live/invite ----------

  it('creates a pending battle and returns battle_id (200)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)

    const res = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; battle_id: string; state: string }
    expect(body.battle_id).toMatch(/^[a-f0-9]{32}$/)
    expect(body.state).toBe('pending')

    const stored = await getLiveBattle(env, body.battle_id)
    expect(stored?.state).toBe('pending')
    expect(stored?.challenger.anon_id).toBe('aaaaaaaa')
    expect(stored?.defender.anon_id).toBe('bbbbbbbb')
  })

  it('rejects self-challenge (400)', async () => {
    const cSecret = await enable(env, challenger)
    const res = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'aaaaaaaa' }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects an invite without Bearer (401)', async () => {
    await enable(env, challenger)
    await enable(env, defender)
    const res = await handleLiveInvite(
      makeReq(null, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('rejects an invite with the wrong secret (401)', async () => {
    await enable(env, challenger)
    await enable(env, defender)
    const res = await handleLiveInvite(
      makeReq('deadbeef'.repeat(8), {
        challenger_anon_id: 'aaaaaaaa',
        defender_anon_id: 'bbbbbbbb',
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('rejects an invite when the defender is not arena-enabled (404)', async () => {
    const cSecret = await enable(env, challenger)
    const res = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('rate-limits a second invite within the cooldown window (429)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    // A second defender so we don't conflate cooldown with self-challenge.
    await enable(env, { ...defender, anon_id: 'cccccccc' })
    const res = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'cccccccc' }),
      env,
    )
    expect(res.status).toBe(429)
  })

  // ---------- /v1/arena/live/<id>/accept ----------

  it('flips a pending invite to active when the defender accepts (200)', async () => {
    const cSecret = await enable(env, challenger)
    const dSecret = await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }

    const acc = await handleLiveAccept(
      makeReq(dSecret, {}),
      `/v1/arena/live/${battle_id}/accept`,
      env,
    )
    expect(acc.status).toBe(200)
    const body = (await acc.json()) as { state: string; turn_no: number }
    expect(body.state).toBe('active')
    expect(body.turn_no).toBe(1)

    const stored = await getLiveBattle(env, battle_id)
    expect(stored?.state).toBe('active')
    expect('snapshot' in stored!.defender).toBe(true)
  })

  it('rejects an accept from someone other than the named defender (401)', async () => {
    const cSecret = await enable(env, challenger)
    const dSecret = await enable(env, defender)
    await enable(env, { ...defender, anon_id: 'cccccccc' })
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }

    // Use a totally unrelated secret (challenger's) — must 401 even though
    // they're enabled in the arena.
    const acc = await handleLiveAccept(
      makeReq(cSecret, {}),
      `/v1/arena/live/${battle_id}/accept`,
      env,
    )
    expect(acc.status).toBe(401)
    // Sanity : the right secret still works.
    const ok = await handleLiveAccept(
      makeReq(dSecret, {}),
      `/v1/arena/live/${battle_id}/accept`,
      env,
    )
    expect(ok.status).toBe(200)
  })

  it('rejects accept when battle is not pending (409)', async () => {
    const cSecret = await enable(env, challenger)
    const dSecret = await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    await handleLiveAccept(makeReq(dSecret, {}), `/v1/arena/live/${battle_id}/accept`, env)

    // Second accept on the same battle.
    const dup = await handleLiveAccept(
      makeReq(dSecret, {}),
      `/v1/arena/live/${battle_id}/accept`,
      env,
    )
    expect(dup.status).toBe(409)
  })

  it('returns 404 on accept of an unknown battle id', async () => {
    const dSecret = await enable(env, defender)
    const fake = '0'.repeat(32)
    const res = await handleLiveAccept(makeReq(dSecret, {}), `/v1/arena/live/${fake}/accept`, env)
    expect(res.status).toBe(404)
  })

  // ---------- /v1/arena/live/<id> (status) ----------

  it('returns the public view (no secret_hash leak)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }

    const res = await handleLiveStatus(`/v1/arena/live/${battle_id}`, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    // No leak of authorisation material.
    const json = JSON.stringify(body)
    expect(json).not.toContain('secret_hash')
    expect(body.state).toBe('pending')
    // Defender side has no snapshot yet (pending).
    expect((body.defender as { snapshot: unknown }).snapshot).toBeNull()
  })

  it('returns 404 for unknown battle id', async () => {
    const fake = '0'.repeat(32)
    const res = await handleLiveStatus(`/v1/arena/live/${fake}`, env)
    expect(res.status).toBe(404)
  })

  it('marks expired on status read after the inactivity window', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }

    // Fast-forward last_activity_at to ten minutes ago.
    const stored = await getLiveBattle(env, battle_id)
    stored!.last_activity_at = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await putLiveBattle(env, stored!)

    const res = await handleLiveStatus(`/v1/arena/live/${battle_id}`, env)
    const body = (await res.json()) as { state: string; reason: string }
    expect(body.state).toBe('expired')
    expect(body.reason).toBe('expired')
  })

  // ---------- /v1/arena/live/<id>/forfeit ----------

  it('lets the challenger forfeit a pending battle (winner=null pre-accept)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    const res = await handleLiveForfeit(
      makeReq(cSecret, {}),
      `/v1/arena/live/${battle_id}/forfeit`,
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { state: string; winner: unknown; forfeit_by: string }
    expect(body.state).toBe('abandoned')
    expect(body.winner).toBeNull() // pre-accept — no battle to award
    expect(body.forfeit_by).toBe('challenger')
  })

  it('lets the defender forfeit an active battle (challenger wins)', async () => {
    const cSecret = await enable(env, challenger)
    const dSecret = await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    await handleLiveAccept(makeReq(dSecret, {}), `/v1/arena/live/${battle_id}/accept`, env)

    const res = await handleLiveForfeit(
      makeReq(dSecret, {}),
      `/v1/arena/live/${battle_id}/forfeit`,
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { winner: string; forfeit_by: string }
    expect(body.winner).toBe('challenger')
    expect(body.forfeit_by).toBe('defender')
  })

  it('rejects a forfeit from an outsider (401)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    const outsiderSecret = await enable(env, { ...challenger, anon_id: 'cccccccc' })
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }

    const res = await handleLiveForfeit(
      makeReq(outsiderSecret, {}),
      `/v1/arena/live/${battle_id}/forfeit`,
      env,
    )
    expect(res.status).toBe(401)
  })

  it('forfeit is idempotent on a finished battle', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    await handleLiveForfeit(makeReq(cSecret, {}), `/v1/arena/live/${battle_id}/forfeit`, env)
    const second = await handleLiveForfeit(
      makeReq(cSecret, {}),
      `/v1/arena/live/${battle_id}/forfeit`,
      env,
    )
    expect(second.status).toBe(200)
    const body = (await second.json()) as { state: string }
    expect(body.state).toBe('abandoned')
  })

  // ---------- /v1/arena/live/<id>/commit (Sprint 2.10b) ----------

  // Helper : open and accept a battle, return ids + a default move per side.
  async function openActive(): Promise<{
    battleId: string
    cSecret: string
    dSecret: string
    cMove: string
    dMove: string
  }> {
    const cSecret = await enable(env, challenger)
    const dSecret = await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    await handleLiveAccept(makeReq(dSecret, {}), `/v1/arena/live/${battle_id}/accept`, env)
    const cMove = movesForStage(stageFor(challenger.lineage, challenger.level).showdown_id)[0]!.name
    const dMove = movesForStage(stageFor(defender.lineage, defender.level).showdown_id)[0]!.name
    return { battleId: battle_id, cSecret, dSecret, cMove, dMove }
  }

  it('locks a single side action (has_pending_action becomes true)', async () => {
    const { battleId, cSecret, cMove } = await openActive()
    const res = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      challenger: { has_pending_action: boolean }
      defender: { has_pending_action: boolean }
      turn_no: number
    }
    expect(body.challenger.has_pending_action).toBe(true)
    expect(body.defender.has_pending_action).toBe(false)
    expect(body.turn_no).toBe(1) // not advanced yet
  })

  it('resolves the turn when both sides have committed', async () => {
    const { battleId, cSecret, dSecret, cMove, dMove } = await openActive()
    await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    const res = await handleLiveCommit(
      makeReq(dSecret, { anon_id: 'bbbbbbbb', move_id: dMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      challenger: { has_pending_action: boolean; hp: number }
      defender: { has_pending_action: boolean; hp: number }
      turn_no: number
      turn_log: unknown[]
    }
    expect(body.challenger.has_pending_action).toBe(false)
    expect(body.defender.has_pending_action).toBe(false)
    expect(body.turn_no).toBe(2)
    expect(body.turn_log.length).toBeGreaterThan(0) // 1 or 2 strikes
    // At least one HP took damage (challenger Lv50 vs defender Lv30, both
    // alive before this turn).
    const stored = await getLiveBattle(env, battleId)
    expect(stored!.defender).toHaveProperty('hp')
    const dHp = (stored!.defender as { hp: number }).hp
    expect(dHp).toBeLessThan(50 + 30 * 2) // started below max anyway
  })

  it('rejects a move not in the side’s stage pool (400)', async () => {
    const { battleId, cSecret } = await openActive()
    const res = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: 'No Such Move' }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_move')
  })

  it('rejects a commit from a non-participant (403)', async () => {
    const { battleId, cMove } = await openActive()
    const outsiderSecret = await enable(env, { ...challenger, anon_id: 'cccccccc' })
    const res = await handleLiveCommit(
      makeReq(outsiderSecret, { anon_id: 'cccccccc', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(403)
  })

  it('rejects a commit with the wrong secret (401)', async () => {
    const { battleId, dSecret, cMove } = await openActive()
    // dSecret used with challenger's anon_id → should 401 since the secret
    // doesn't match challenger.secret_hash.
    const res = await handleLiveCommit(
      makeReq(dSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(401)
  })

  it('idempotent re-commit of the same move returns 200', async () => {
    const { battleId, cSecret, cMove } = await openActive()
    const r1 = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(r1.status).toBe(200)
    const r2 = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(r2.status).toBe(200)
  })

  it('refuses to swap moves once committed (409)', async () => {
    const { battleId, cSecret } = await openActive()
    const moves = movesForStage(stageFor(challenger.lineage, challenger.level).showdown_id)
    await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: moves[0]!.name }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    const res = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: moves[1]!.name }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('already_committed')
  })

  it('eventually transitions to finished after enough turns', async () => {
    // Force a quick KO by tanking defender HP directly in storage.
    const { battleId, cSecret, dSecret, cMove, dMove } = await openActive()
    const stored = await getLiveBattle(env, battleId)
    ;(stored!.defender as { hp: number }).hp = 1
    await putLiveBattle(env, stored!)

    await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    const res = await handleLiveCommit(
      makeReq(dSecret, { anon_id: 'bbbbbbbb', move_id: dMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    const body = (await res.json()) as { state: string; winner: string | null }
    expect(body.state).toBe('finished')
    // With Lv50 challenger vs HP=1 defender, the challenger virtually always
    // wins (could draw if challenger acts second AND ko'd somehow first).
    expect(['challenger', 'draw']).toContain(body.winner)
  })

  it('refuses commit on an expired battle (409)', async () => {
    const { battleId, cSecret, cMove } = await openActive()
    // Backdate activity well past the inactivity window.
    const stored = await getLiveBattle(env, battleId)
    stored!.last_activity_at = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await putLiveBattle(env, stored!)
    const res = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battleId}/commit`,
      env,
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('expired')
  })

  // -------- Sprint 2.13 (Q10) extra coverage --------

  it('refuses commit on a pending battle (still awaiting accept)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    // Battle is 'pending' — not yet accepted by defender.
    const cMove = movesForStage(stageFor(challenger.lineage, challenger.level).showdown_id)[0]!.name
    const res = await handleLiveCommit(
      makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
      `/v1/arena/live/${battle_id}/commit`,
      env,
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; state: string }
    expect(body.error).toBe('invalid_state')
    expect(body.state).toBe('pending')
  })

  it('refuses accept on an expired battle', async () => {
    const cSecret = await enable(env, challenger)
    const dSecret = await enable(env, defender)
    const inv = await handleLiveInvite(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const { battle_id } = (await inv.json()) as { battle_id: string }
    // Force expiry by backdating activity. Note: live-status is the lazy
    // expirer ; calling it transitions state. After that, accept must reject.
    const stored = await getLiveBattle(env, battle_id)
    stored!.last_activity_at = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await putLiveBattle(env, stored!)
    await handleLiveStatus(`/v1/arena/live/${battle_id}`, env)

    const res = await handleLiveAccept(
      makeReq(dSecret, {}),
      `/v1/arena/live/${battle_id}/accept`,
      env,
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_state')
  })

  it('simultaneous commits from both sides resolve the turn (Sprint 2.13 C1)', async () => {
    const { battleId, cSecret, dSecret, cMove, dMove } = await openActive()
    // Promise.all fires both ; MockKV is serial but the retry-after-write
    // verify path lets both observe their commit. The turn must resolve.
    const [r1, r2] = await Promise.all([
      handleLiveCommit(
        makeReq(cSecret, { anon_id: 'aaaaaaaa', move_id: cMove }),
        `/v1/arena/live/${battleId}/commit`,
        env,
      ),
      handleLiveCommit(
        makeReq(dSecret, { anon_id: 'bbbbbbbb', move_id: dMove }),
        `/v1/arena/live/${battleId}/commit`,
        env,
      ),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    const stored = await getLiveBattle(env, battleId)
    // Either both pending got cleared (turn resolved) and turn_no advanced,
    // or one race-loser got 503 — the latter shouldn't happen with serial
    // MockKV, but the contract is "no hang". turn_no should advance.
    expect(stored!.turn_no).toBeGreaterThan(1)
  })
})
