// claude-pokemon-api — Cloudflare Worker for shared anonymous stats.
//
// Layered architecture :
//   Router  (this file)            : URL → handler dispatch
//   Handlers (./handlers/*.ts)     : business logic per endpoint
//   Lib     (./lib/*.ts)           : pure validation, SVG gen, KV access
//   Types   (./types.ts)           : shared contracts
//
// Privacy stance :
//   - We do NOT log or store IPs (cf-connecting-ip never read).
//   - [observability] enabled = false in wrangler.toml (Workers Logs off).
//   - anon_id is client-generated 8-16 hex, no link to identity.
//   - Strict whitelist on submit payload — extra fields silently dropped.

import type { Env } from './env.d'
import { corsHeaders, jsonResp } from './lib/http'
import { SCHEMA_VERSION } from './types'
import { handleSubmit } from './handlers/submit'
import { handleLeaderboard } from './handlers/leaderboard'
import { handleAggregate } from './handlers/aggregate'
import { handleForget } from './handlers/forget'
import { handleTrainer } from './handlers/trainer'
import { handleTrainerProfilePatch } from './handlers/trainer-profile'
import { handleZoneDetail } from './handlers/zone/detail'
import { handleZoneExplore } from './handlers/zone/explore'
import { handleZoneFight } from './handlers/zone/fight'
import { handleZoneFlee } from './handlers/zone/flee'
import { handleZoneList } from './handlers/zone/list'
import { handleBadge } from './handlers/badge'
import { handleArenaEnable } from './handlers/arena/enable'
import { handleArenaDisable } from './handlers/arena/disable'
import { handleArenaRegenerate } from './handlers/arena/regenerate'
import { handleArenaChallenge } from './handlers/arena/challenge'
import { handleArenaBattle } from './handlers/arena/battle'
import { handleArenaOpponents } from './handlers/arena/opponents'
import { handleArenaReact } from './handlers/arena/react'
import { handleLiveInvite } from './handlers/arena/live-invite'
import { handleLiveAccept } from './handlers/arena/live-accept'
import { handleLiveStatus } from './handlers/arena/live-status'
import { handleLiveForfeit } from './handlers/arena/live-forfeit'
import { handleLiveCommit } from './handlers/arena/live-commit'
import { handlePairInit } from './handlers/arena/pair-init'
import { handlePairRedeem } from './handlers/arena/pair-redeem'
import { handleArenaWhoami } from './handlers/arena/whoami'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    try {
      if (url.pathname === '/v1/health') {
        return jsonResp({ status: 'ok', schema_version: SCHEMA_VERSION })
      }
      if (url.pathname === '/v1/submit' && request.method === 'POST') {
        return await handleSubmit(request, env)
      }
      if (url.pathname === '/v1/leaderboard' && request.method === 'GET') {
        return await handleLeaderboard(url, env)
      }
      if (url.pathname === '/v1/aggregate' && request.method === 'GET') {
        return await handleAggregate(env)
      }
      if (url.pathname === '/v1/forget' && request.method === 'DELETE') {
        return await handleForget(url, env)
      }
      if (url.pathname.startsWith('/v1/badge/') && request.method === 'GET') {
        return await handleBadge(url.pathname, env)
      }
      if (
        url.pathname.startsWith('/v1/trainer/') &&
        url.pathname.endsWith('/profile') &&
        request.method === 'PATCH'
      ) {
        return await handleTrainerProfilePatch(request, url.pathname, env)
      }
      if (url.pathname.startsWith('/v1/trainer/') && request.method === 'GET') {
        return await handleTrainer(url.pathname, env)
      }
      if (url.pathname === '/v1/arena/enable' && request.method === 'POST') {
        return await handleArenaEnable(request, env)
      }
      if (url.pathname === '/v1/arena/whoami' && request.method === 'GET') {
        return await handleArenaWhoami(request, url, env)
      }
      if (url.pathname === '/v1/arena/disable' && request.method === 'DELETE') {
        return await handleArenaDisable(request, url, env)
      }
      if (url.pathname === '/v1/arena/regenerate' && request.method === 'POST') {
        return await handleArenaRegenerate(request, env)
      }
      if (url.pathname === '/v1/arena/challenge' && request.method === 'POST') {
        return await handleArenaChallenge(request, env)
      }
      if (url.pathname === '/v1/arena/opponents' && request.method === 'GET') {
        return await handleArenaOpponents(url, env)
      }
      if (
        url.pathname.startsWith('/v1/arena/battle/') &&
        url.pathname.endsWith('/react') &&
        request.method === 'POST'
      ) {
        return await handleArenaReact(request, url.pathname, env)
      }
      if (url.pathname.startsWith('/v1/arena/battle/') && request.method === 'GET') {
        return await handleArenaBattle(url.pathname, env)
      }
      // Pair codes (Sprint 2.12) — /init must match before the live router
      // (paths share the /v1/arena/ prefix but have stable suffixes).
      if (url.pathname === '/v1/arena/pair/init' && request.method === 'POST') {
        return await handlePairInit(request, env)
      }
      if (url.pathname === '/v1/arena/pair/redeem' && request.method === 'POST') {
        return await handlePairRedeem(request, env)
      }
      // Live PvP (Sprint 2.10) — order matters : the more-specific
      // /accept|/forfeit suffixes must match before the generic GET status.
      if (url.pathname === '/v1/arena/live/invite' && request.method === 'POST') {
        return await handleLiveInvite(request, env)
      }
      if (
        url.pathname.startsWith('/v1/arena/live/') &&
        url.pathname.endsWith('/accept') &&
        request.method === 'POST'
      ) {
        return await handleLiveAccept(request, url.pathname, env)
      }
      if (
        url.pathname.startsWith('/v1/arena/live/') &&
        url.pathname.endsWith('/forfeit') &&
        request.method === 'POST'
      ) {
        return await handleLiveForfeit(request, url.pathname, env)
      }
      if (
        url.pathname.startsWith('/v1/arena/live/') &&
        url.pathname.endsWith('/commit') &&
        request.method === 'POST'
      ) {
        return await handleLiveCommit(request, url.pathname, env)
      }
      if (url.pathname.startsWith('/v1/arena/live/') && request.method === 'GET') {
        return await handleLiveStatus(url.pathname, env)
      }
      // Wild zones (Sprint 4.5 + 4.6). Order matters : action endpoints
      // (singular /zone/<id>/...) before the plural catalog /zones[/<id>].
      if (
        url.pathname.startsWith('/v1/zone/') &&
        url.pathname.endsWith('/explore') &&
        request.method === 'POST'
      ) {
        return await handleZoneExplore(request, url.pathname, env)
      }
      if (
        url.pathname.startsWith('/v1/zone/') &&
        url.pathname.endsWith('/fight') &&
        request.method === 'POST'
      ) {
        return await handleZoneFight(request, url.pathname, env)
      }
      if (
        url.pathname.startsWith('/v1/zone/') &&
        url.pathname.endsWith('/flee') &&
        request.method === 'POST'
      ) {
        return await handleZoneFlee(request, url.pathname, env)
      }
      if (url.pathname === '/v1/zones' && request.method === 'GET') {
        return await handleZoneList(env)
      }
      if (url.pathname.startsWith('/v1/zones/') && request.method === 'GET') {
        return await handleZoneDetail(url.pathname, env)
      }
      return jsonResp({ error: 'not_found', path: url.pathname }, 404)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      return jsonResp({ error: 'internal', message }, 500)
    }
  },
}
