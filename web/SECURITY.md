# Security Policy

`claude-pokemon-arena` is the web companion to the `claude-pokemon` CLI.
It runs on Cloudflare Pages (SSR) and talks to a single Cloudflare Worker
(`claude-pokemon-api`) for all dynamic data.

## Threat model in one paragraph

- **Anonymous-by-default auth** : the site uses an `anon_id` (8-16 hex,
  generated client-side) + `arena_secret` (32-64 hex, returned once by the
  Worker at signup) pair, stored in `localStorage['arena-session-v1']`. No
  email, no OAuth, no PII. The secret is hashed (sha256) server-side and
  compared in constant time. Reset via the recovery-key flow on `/login`
  (the user re-pastes both values).
- **XSS surface** : the secret in localStorage is readable by any script
  running on this origin. We mitigate by (a) never using `v-html` on
  user-controlled content, (b) recommending a strict CSP at the CF Pages
  level, (c) one-click rotation via the CLI's `/pokemon arena regenerate`.
  This is acceptable for our threat surface (no money, no PII) but worth
  re-evaluating if the model shifts.
- **No PII collected** : no IP logging on the Worker (`cf-connecting-ip`
  never read, Workers Logs disabled). User-set `display_name` is **public**
  when set — and only ever ASCII alnum + `_-` (2-24 chars).
- **Sprites** are hot-linked from `play.pokemonshowdown.com` (public CDN) —
  no upload, no storage of user-generated images.

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security findings.**

Email : **benoit.bruneau@ageval.fr** with subject line `[arena security]`.
Include :

- A description of the issue
- Reproduction steps (or PoC)
- The version / commit affected (https://claude-pokemon-arena.pages.dev/
  serves the `main` branch HEAD)
- Your assessment of severity + scope

I'll acknowledge within 5 working days, and aim to ship a fix within 30
days for high-severity issues.

## Out of scope

- Issues that require XSS via a third-party browser extension
- Issues with `play.pokemonshowdown.com` (sprite host) — those should be
  reported to Pokémon Showdown directly
- Theoretical issues without a reproduction
- Pokémon-themed wordplay 🌿
