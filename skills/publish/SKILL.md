---
name: publish
description: Guides through the npm publish workflow for claude-pokemon - bumps the version, tags the commit, pushes, runs npm publish, and aligns the latest dist-tag. Pauses for user confirmation at irreversible steps. Use when the user says "publie", "publish", "release", "ship beta.X", or asks to push a new version to npm. Keywords - publish, npm, release, bump, version, tag, dist-tag, beta.
---

Walks the publish workflow defined in CONTRIBUTING.md and CLAUDE.md, stopping before any irreversible action (publish, push tags) for an explicit user confirmation.

## Required environment

This skill runs from `~/repositories/perso/claude-pokemon/`. If you're in a different repo (e.g. `claude-pokemon-arena`), tell the user and stop.

## Action

1. **Sanity checks** (no user prompt) :
   - On branch `main`, clean working tree
   - Logged into npm as `Benoit1108` (check `npm whoami`)
   - Pre-push gates all green (`npm run ci:pre-push`)
2. **Pick the bump** :
   - Read current `package.json.version`
   - If user gave a specific version (`/publish 1.0.0-beta.7`), use it
   - Else propose : current + 1 on the beta counter, ASK USER to confirm
3. **Bump version** :
   ```bash
   jq --arg v "$NEW" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
   ```
4. **Commit + tag (NO push yet)** :
   ```bash
   git add package.json
   git commit -m "chore: bump v<NEW>"
   git tag v<NEW>
   ```
5. **Pause for user confirmation** before pushing or publishing. Show :
   - The new version
   - The commit message
   - The tag name
   - The dist-tags state (`npm view claude-pokemon dist-tags --json`)
6. **On user OK** — execute in order :
   ```bash
   git push origin main --tags
   npm publish --access public --tag beta
   npm dist-tag add claude-pokemon@<NEW> latest
   ```
   Note: the `latest` dist-tag bump is intentional — `--tag beta` doesn't touch `latest` and the npmjs.com UI would otherwise display a stale "current" version. Drop this step after the 1.0.0 stable.
7. **Verify** :
   ```bash
   curl -s https://registry.npmjs.org/claude-pokemon | jq '.["dist-tags"]'
   ```
8. **Report** :
   - New version
   - npm URL
   - GitHub release URL (manual, link to https://github.com/Benoit1108/claude-pokemon/releases/new?tag=v<NEW>)

## Failure modes

- If npm publish fails for auth, point user at `.npmrc` (token may be expired)
- If `git push` fails for hook (Claude Code pre-push), it's because something went red — report and stop, don't force.
- If a tag with that version already exists locally, delete it (`git tag -d v<X>`) and start over after fixing the version conflict

## NEVER

- Never amend the bump commit
- Never `--force` anything
- Never skip the user confirmation at step 5 — even in auto-mode this is irreversible
