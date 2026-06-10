#!/usr/bin/env bash
# Convert the latest Playwright video (.webm) in .demo/output to a
# GitHub-friendly GIF (~3 MB target, 12 fps, 720 px wide).
#
# Requires : ffmpeg in PATH.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
OUT_DIR="$SCRIPT_DIR/output"
PALETTE="$OUT_DIR/palette.png"
GIF="$SCRIPT_DIR/arena-demo.gif"

# Resolve ffmpeg binary : prefer the ffmpeg-static npm install (no sudo
# required), fall back to system ffmpeg if installed.
if [ -f "$SCRIPT_DIR/../node_modules/ffmpeg-static/ffmpeg" ]; then
  FFMPEG="$SCRIPT_DIR/../node_modules/ffmpeg-static/ffmpeg"
elif command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG=ffmpeg
else
  echo "❌ ffmpeg not found. Either : npm i -D ffmpeg-static  OR  sudo apt install ffmpeg" >&2
  exit 1
fi
echo "ffmpeg : $FFMPEG"

# Pick the latest .webm in output/ (Playwright generates a hashed filename).
VIDEO=$(ls -t "$OUT_DIR"/*.webm 2>/dev/null | head -n1 || true)
if [ -z "$VIDEO" ]; then
  echo "❌ No .webm found in $OUT_DIR. Did you run \`node .demo/record.mjs\` first?" >&2
  exit 1
fi
echo "Source : $VIDEO"

# Two-pass conversion (palette extraction → GIF render) for better colors.
"$FFMPEG" -y -i "$VIDEO" -vf "fps=12,scale=720:-1:flags=lanczos,palettegen=stats_mode=diff" "$PALETTE"
"$FFMPEG" -y -i "$VIDEO" -i "$PALETTE" \
  -filter_complex "fps=12,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" \
  "$GIF"

rm -f "$PALETTE"
SIZE_KB=$(du -k "$GIF" | cut -f1)
echo "✓ Generated $GIF (${SIZE_KB} KB)"
