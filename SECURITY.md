# Security Policy

`claude-pokemon` is a Pokémon-themed companion CLI for Claude Code. It runs
fully on-device for most users. The optional `stats-share` feature opens a
single anonymous endpoint to a Cloudflare Worker — that's the only network
surface.

## Threat model in one paragraph

- **Local state** lives in `~/.claude/pokemon/state.json`. It contains no
  PII by default (`anon_id` is 8 hex chars from `/dev/urandom`, no name, no
  email, no IP). If the user opted in to `stats-share`, the `anon_id` plus
  whitelisted lifetime stats are POSTed daily (or via auto-submit hook). A
  user-set `display_name` is **public** if shared.
- **Arena auth** uses an `arena_secret` (128 bits, hex). Stored locally
  chmod 600 on the CLI side, hashed (sha256, constant-time compared)
  server-side. Bearer-token on every mutating endpoint, 5-min replay window
  via timestamped nonce. Recovery model is "save your key" — anonymous-by-
  default trades reset-via-email for not collecting an email.
- **Worker** never logs IPs (`cf-connecting-ip` is never read, Workers Logs
  is disabled in `wrangler.toml`).
- **Sprites** are fetched from `play.pokemonshowdown.com` at install time
  and cached locally — no runtime network calls.

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security findings.**

Email : **benoit.bruneau@ageval.fr** with subject line `[claude-pokemon
security]`. Include :

- A description of the issue
- Reproduction steps (or PoC)
- The version affected (`npx claude-pokemon --version`)
- Your assessment of severity + scope

I'll acknowledge within 5 working days, and aim to ship a fix within 30
days for high-severity issues. For lower severity, fix lands in the next
beta release.

## Out of scope

- Issues that require physical access to the user's machine
- Issues with third-party dependencies that are already public CVEs (please
  open an issue with the `dependencies` label instead)
- Pokémon-themed wordplay 🌿
