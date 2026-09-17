#!/usr/bin/env bash
#
# Builds public/fonts/fraunces-var.woff2 — the app's one display face.
#
# Run this only when the face itself needs rebuilding (a new Fraunces
# release, or a glyph the subset does not carry). The output is committed,
# so a normal build and a normal checkout never touch this script and never
# need Python.
#
#   ./tools/build-font.sh
#
# Why a shell script and not a tools/*.mjs like build-icons: subsetting a
# variable font means fontTools, which is Python. There is no Node equivalent
# worth the dependency for something that runs twice a year.
#
# What it does, and why each step earns its bytes:
#
#   1. Takes Google's pre-subset *latin* variable woff2 rather than the full
#      upstream release. Upstream carries Cyrillic, Greek and Vietnamese the
#      app will never render.
#   2. Clamps wght to 400..700. AGENTS.md allows three weights — normal 400,
#      medium 500, semibold 600 — so the 100..399 and 701..900 ends of the
#      designspace are dead weight. 700 is kept as headroom, not used.
#   3. Keeps opsz 9..144 in full. That axis is the point of Fraunces: the
#      display sizes get the dramatic high-contrast cut, the small ones stay
#      readable. Losing it would leave a serif with no reason to be here.
#   4. Subsets the character set to what the five permitted call sites can
#      actually render (see UNICODES below).
#
# Licence: Fraunces is SIL OFL 1.1. Name IDs 0, 13 and 14 — the copyright,
# the licence text and its URL — are deliberately retained in the binary,
# and public/fonts/OFL.txt ships beside it. Do not "optimise" those away.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT="public/fonts/fraunces-var.woff2"
BUDGET_KB=40

# Google Fonts' latin variable slice, opsz + wght. Pinned to v38; bump the
# URL deliberately rather than letting it drift.
SRC_URL="https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2"
OFL_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt"

# The glyphs the five permitted call sites can render, and nothing else:
#   U+0020-007E  ASCII. All English UI text, digits and punctuation.
#   U+00A0       non-breaking space.
#   U+00B7       the date line's separator: "Thursday 17 September · page 260".
#   U+00D7       the carried stamp's multiplication sign: "carried ×4".
#   U+2013       en dash, for ranges.
#   U+2018/19    curly quotes. 2019 is the apostrophe in every contraction the
#                copy deck uses ("you don't", "it's"), so it is load-bearing.
#   U+201C/1D    curly double quotes, used in the value props.
#   U+2026       ellipsis.
# No em dash: the copy deck bans it from anything a user reads.
UNICODES="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2018,U+2019,U+201C,U+201D,U+2026"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> setting up fontTools"
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install -q "fonttools[woff]"
PY="$WORK/venv/bin/python"

echo "==> fetching Fraunces (latin, variable)"
curl -sSf --max-time 60 -o "$WORK/src.woff2" "$SRC_URL"

# min:default:max, not min:max. Without the explicit 400 default the
# instancer clamps Fraunces' own default (900) to the top of the new range
# and ships a font whose regular weight is semibold — which looks like the
# CSS is ignoring font-weight rather than like a bad build.
echo "==> clamping wght to 400..700 (default 400), keeping opsz 9..144"
"$PY" -m fontTools.ttLib "$WORK/src.woff2" -o "$WORK/src.ttf" >/dev/null 2>&1 \
  || "$PY" -c "
from fontTools.ttLib import TTFont
TTFont('$WORK/src.woff2').save('$WORK/src.ttf')
"
"$PY" -m fontTools.varLib.instancer "$WORK/src.ttf" "wght=400:400:700" \
  -o "$WORK/clamped.ttf" >/dev/null

# `rvrn` is in that list for a reason. It is a *required* feature — the
# shaper applies it unconditionally — and Fraunces drives it from
# FeatureVariations to swap glyph forms across the opsz axis. pyftsubset
# does not keep it unless asked, and a build without it renders the wrong
# forms at display sizes while looking perfectly fine at 15px, which is
# about the worst failure mode available. Note also that Fraunces carries
# no `tnum`: its digits are proportional, so `tabular-nums` does nothing
# under this face. Do not add the class back to a Fraunces call site.
echo "==> subsetting"
"$PY" -m fontTools.subset "$WORK/clamped.ttf" \
  --output-file="$WORK/out.woff2" \
  --flavor=woff2 \
  --unicodes="$UNICODES" \
  --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,rlig,rvrn' \
  --name-IDs='0,1,2,3,13,14,16,17' \
  --drop-tables+=gasp \
  --no-prune-unicode-ranges

mkdir -p public/fonts
mv "$WORK/out.woff2" "$OUT"

echo "==> fetching OFL"
curl -sSf --max-time 60 -o public/fonts/OFL.txt "$OFL_URL"

SIZE_B=$(wc -c < "$OUT" | tr -d ' ')
SIZE_KB=$(( SIZE_B / 1024 ))
echo
echo "    $OUT — ${SIZE_KB} kB (${SIZE_B} bytes)"

if [ "$SIZE_KB" -gt "$BUDGET_KB" ]; then
  echo "    OVER BUDGET: ${SIZE_KB} kB > ${BUDGET_KB} kB." >&2
  echo "    Drop a glyph range or narrow an axis before committing this." >&2
  exit 1
fi

echo "    within the ${BUDGET_KB} kB budget."
