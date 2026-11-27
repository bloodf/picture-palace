#!/usr/bin/env bash
# Rebuilds every art asset from source. Only needed if you change the models or the floor plan.
# Requires: Python 3.13 venv with `pip install bpy==5.3.0 pillow scipy trimesh pyoidn` and `pip install --no-deps anny`
# (anny ships the CC0 MakeHuman/MPFB2 base mesh). Point PY at that venv's python.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-$HOME/.toolchain/bl/bin/python}"
npx tsx tools/export-plan.ts
"$PY" tools/make_textures.py
( cd tools/blender
  "$PY" build_characters.py
  "$PY" build_props.py
  LOW=1 "$PY" build_props.py
  "$PY" build_films.py
  SPP=20 LMSCALE=0.8 "$PY" build_shell.py )
"$PY" tools/grade_films.py
