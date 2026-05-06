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
import { handleBadge } from './handlers/badge'

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
      if (url.pathname.startsWith('/v1/trainer/') && request.method === 'GET') {
        return await handleTrainer(url.pathname, env)
      }
      return jsonResp({ error: 'not_found', path: url.pathname }, 404)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      return jsonResp({ error: 'internal', message }, 500)
    }
  },
}
