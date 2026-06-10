#!/usr/bin/env node
// Sprint 5 — build-time GitHub stars fetcher. Runs as `predev` + `prebuild`
// to populate NUXT_PUBLIC_GITHUB_STARS env var via a generated .env.local
// fragment.
//
// Why build-time : the pill in AppHeader reads from runtimeConfig.public,
// so we don't want a runtime fetch (costs latency on every cold start +
// GitHub API rate limits). Refreshing the value once per build is enough
// for a vanity counter.
//
// Failure mode : if the fetch fails (offline, rate-limited, repo renamed),
// write 0 and let the dev/build continue. The pill template gracefully
// shows "★ —" when stars == 0.

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'Benoit1108/claude-pokemon'
const REPO_URL = `https://api.github.com/repos/${REPO}`
const TIMEOUT_MS = 5000

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '..', '.env.local')
const KEY = 'NUXT_PUBLIC_GITHUB_STARS'

async function fetchStars() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(REPO_URL, {
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'claude-pokemon-arena-build',
      },
    })
    if (!r.ok) {
      console.warn(`[stars] GitHub API ${r.status} — falling back to 0`)
      return 0
    }
    const data = await r.json()
    const n = Number(data.stargazers_count)
    return Number.isFinite(n) ? n : 0
  } catch (err) {
    console.warn(`[stars] fetch failed (${err?.message || err}) — falling back to 0`)
    return 0
  } finally {
    clearTimeout(timer)
  }
}

// Merge the stars var into .env.local without clobbering other vars. We
// rewrite/append the single KEY line ; everything else stays untouched.
async function persistStars(n) {
  let existing = ''
  try {
    existing = await readFile(OUT_PATH, 'utf8')
  } catch {
    /* file doesn't exist yet — fine */
  }
  const lines = existing.split('\n').filter((l) => l && !l.startsWith(`${KEY}=`))
  lines.push(`${KEY}=${n}`)
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, lines.join('\n') + '\n', 'utf8')
}

const stars = await fetchStars()
await persistStars(stars)
console.log(`[stars] ${REPO}: ${stars} → ${OUT_PATH}`)
