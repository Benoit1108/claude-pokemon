# Demo GIF generator

Scripted browser session showcasing the arena features (leaderboard →
arena pool → trainer page → animated battle replay), recorded via
Playwright video capture and converted to a GitHub-friendly GIF.

## Why mock the API?

The Worker `/v1/arena/*` endpoints depend on real opt-in trainers + a
seeded battle. Rather than polluting prod KV with demo data, the
recording script intercepts every Worker call and returns hand-crafted
fixtures. The video shows realistic UI without needing live state.

## One-time setup

```bash
# 1. Playwright + Chromium (~200 MB)
npm i -D playwright
npx playwright install chromium

# 2. ffmpeg (Debian/Ubuntu)
sudo apt install ffmpeg
# macOS : brew install ffmpeg
```

## Recording flow

```bash
# Terminal 1 : run the dev server
cd /path/to/claude-pokemon-arena
npm run dev

# Terminal 2 : record the session
node .demo/record.mjs        # outputs .demo/output/<hash>.webm
bash .demo/build-gif.sh      # converts to .demo/arena-demo.gif (~3 MB)
```

## Tuning

- `record.mjs` :
  - `VIEWPORT` — recording resolution (960×600 default, fits well in
    GitHub README)
  - `waitForTimeout` calls between navigations control pacing — bump
    them up if the recording feels rushed
  - `mockBattle.turns` — change the seeded battle to highlight different
    mechanics (more crits, longer fight, etc.)
- `build-gif.sh` :
  - `fps=12, scale=720` keeps the GIF under ~3 MB. Bump fps to 24 for
    smoother animation at the cost of file size
  - `dither=bayer:bayer_scale=4` is a good default; try
    `dither=floyd_steinberg` for less banding on gradients

## Embedding in README

```markdown
![arena demo](.demo/arena-demo.gif)
```

GitHub renders inline GIFs without size limits, but keep it under ~5 MB
to avoid slow loads on mobile.
