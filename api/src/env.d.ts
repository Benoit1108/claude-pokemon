// Cloudflare Worker environment bindings.
// `STATS` is the KV namespace declared in wrangler.toml.

import type { KVNamespace } from '@cloudflare/workers-types'

export interface Env {
  STATS: KVNamespace
}
