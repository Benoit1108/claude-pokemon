#!/usr/bin/env bash
# Re-génère assets/themes-demo.gif depuis .demo/demo-themes.sh.
# Prereqs : asciinema (apt) + agg (~/.local/bin/) + gifsicle (apt).

set -eu

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

CAST="$ROOT/.demo/themes-demo.cast"
GIF_RAW="$ROOT/.demo/themes-demo-raw.gif"
GIF_OUT="$ROOT/assets/themes-demo.gif"

mkdir -p "$ROOT/assets"
rm -f "$CAST" "$GIF_RAW" "$GIF_OUT"

echo "▶ Recording ..."
# 90×30 : same as main demo, accommodates stats view
asciinema rec --cols 90 --rows 30 --idle-time-limit 2 \
  --command "bash $ROOT/.demo/demo-themes.sh" "$CAST"

echo "▶ Converting to GIF ..."
# theme monokai for default rendering ; retro frames will paint themselves green
agg --font-size 14 --speed 1.2 --theme monokai "$CAST" "$GIF_RAW"

echo "▶ Optimizing ..."
gifsicle --optimize=3 --colors 128 --lossy=80 "$GIF_RAW" -o "$GIF_OUT"

orig=$(stat -c '%s' "$GIF_RAW")
final=$(stat -c '%s' "$GIF_OUT")
printf '✔ Done : %s (%d KB → %d KB)\n' "$GIF_OUT" $((orig/1024)) $((final/1024))
