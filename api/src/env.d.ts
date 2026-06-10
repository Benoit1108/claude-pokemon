// Cloudflare Worker environment bindings.
// `STATS` is the KV namespace declared in wrangler.toml.

import type { KVNamespace } from '@cloudflare/workers-types'

export interface Env {
  STATS: KVNamespace
  /** GitHub OAuth app (R2b). CLIENT_ID is a plain var ; CLIENT_SECRET is a
   * wrangler secret (`wrangler secret put GITHUB_CLIENT_SECRET`). Both optional
   * — when unset, the GitHub auth endpoints return 503 `github_oauth_unconfigured`. */
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}
