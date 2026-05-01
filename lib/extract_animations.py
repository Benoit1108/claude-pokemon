#!/usr/bin/env python3
"""
Extracts animated GIF sprites from Pokémon Showdown, pads each frame to 96x96
centered (matches static gen5 PNG dimensions), and converts to ANSI text via chafa.

Output: ~/.claude/pokemon/sprites-mini-anim/{normal,shiny}/<showdown_id>/frame_NN.txt

Requires : Python 3.8+, Pillow, curl, chafa.
Usage    : python3 extract_animations.py [--target-dir <dir>] [--frames <n>]
"""

import argparse, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow", file=sys.stderr)
    sys.exit(1)


def extract(target_dir: Path, target_frames: int = 5) -> tuple[int, int]:
    data_file = target_dir / "data.json"
    if not data_file.exists():
        print(f"ERROR: {data_file} not found. Run install first.", file=sys.stderr)
        return 0, 0

    data = json.loads(data_file.read_text())
    ids = sorted({s["showdown_id"] for lin in data["lineages"].values() for s in lin["stages"]})

    anim_dir = target_dir / "sprites-mini-anim"
    if anim_dir.exists():
        shutil.rmtree(anim_dir)
    (anim_dir / "normal").mkdir(parents=True)
    (anim_dir / "shiny").mkdir(parents=True)

    canvas_size = (96, 96)
    processed = skipped = 0

    for variant in ("normal", "shiny"):
        url_path = "gen5ani" if variant == "normal" else "gen5ani-shiny"
        for sid in ids:
            url = f"https://play.pokemonshowdown.com/sprites/{url_path}/{sid}.gif"
            with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as tmp:
                tmp_gif = Path(tmp.name)
            rc = subprocess.run(["curl", "-sf", "-o", str(tmp_gif), url], capture_output=True).returncode
            if rc != 0:
                skipped += 1
                tmp_gif.unlink(missing_ok=True)
                continue
            try:
                gif = Image.open(tmp_gif)
            except Exception:
                skipped += 1
                tmp_gif.unlink(missing_ok=True)
                continue

            out_dir = anim_dir / variant / sid
            out_dir.mkdir(parents=True, exist_ok=True)
            extracted = 0
            try:
                while extracted < target_frames:
                    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
                    frame = gif.convert("RGBA")
                    ox = (canvas_size[0] - frame.width) // 2
                    oy = (canvas_size[1] - frame.height) // 2
                    canvas.paste(frame, (ox, oy), frame)
                    tmp_png = out_dir / f"_tmp_{extracted}.png"
                    canvas.save(tmp_png)
                    result = subprocess.run(
                        ["chafa", "--size", "24x12", "--symbols", "block", str(tmp_png)],
                        capture_output=True, text=True
                    )
                    if result.returncode == 0:
                        (out_dir / f"frame_{extracted:02d}.txt").write_text(result.stdout)
                    tmp_png.unlink(missing_ok=True)
                    extracted += 1
                    gif.seek(gif.tell() + 1)
            except EOFError:
                pass
            tmp_gif.unlink(missing_ok=True)
            processed += 1

    return processed, skipped


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--target-dir", default=str(Path.home() / ".claude/pokemon"),
                   help="Target ~/.claude/pokemon directory")
    p.add_argument("--frames", type=int, default=5, help="Frames per sprite (default 5)")
    args = p.parse_args()

    target = Path(args.target_dir)
    if not target.exists():
        print(f"ERROR: {target} not found", file=sys.stderr)
        return 1

    print(f"Extracting animated frames into {target / 'sprites-mini-anim'}/...")
    processed, skipped = extract(target, args.frames)

    anim_dir = target / "sprites-mini-anim"
    total_frames = sum(1 for _ in anim_dir.rglob("frame_*.txt")) if anim_dir.exists() else 0
    cache_kb = sum(f.stat().st_size for f in anim_dir.rglob("*.txt")) // 1024 if anim_dir.exists() else 0

    print(f"✓ {processed} sprite-variants animated, {skipped} skipped (no GIF available)")
    print(f"  {total_frames} frames total, {cache_kb} KB cache")

    return 0


if __name__ == "__main__":
    sys.exit(main())
