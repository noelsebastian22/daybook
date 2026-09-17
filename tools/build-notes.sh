#!/usr/bin/env bash
#
# Builds src/app/features/welcome/notes.data.ts — the two handwritten notes
# in the welcome hero, as SVG outlines.
#
#   ./tools/build-notes.sh
#
# Run it only when the note text changes. The output is committed, so no
# build and no checkout needs Python or a network connection.
#
# Why outlines and not a webfont (RETHEME-PLAN D1): the notes are two fixed
# decorative strings. Shipping Caveat as a second @font-face would
# contradict the "one display face, self-hosted, and nothing else" rule in
# AGENTS.md, add a request and a swap flash to a marketing page, and — when
# measured — come out *larger* over the wire than the outlines do:
#
#     Caveat subset, 18 glyphs, woff2     12.7 kB
#     these outlines, gzipped             ~11.4 kB, and no second request
#
# Hand-drawing the paths instead was the other option in D1 and was rejected
# as a coin flip. This way the handwriting is genuinely Caveat's.
#
# Licence: Caveat is SIL OFL 1.1, but nothing OFL-covered ships here. The
# OFL governs font software; outlines of text rendered *in* a font are not
# font software and are not restricted by it (see the OFL FAQ, 1.10 and
# 2.4). Caveat is a build-time input only and never reaches the bundle.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT="src/app/features/welcome/notes.data.ts"

# Caveat latin, variable. Pinned to v23; bump deliberately.
SRC_URL="https://fonts.gstatic.com/s/caveat/v23/Wnz6HAc5bAfYB2Q7ZjYYiAzcPA.woff2"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> setting up fontTools"
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install -q "fonttools[woff]"

echo "==> fetching Caveat"
curl -sSf --max-time 60 -o "$WORK/caveat.woff2" "$SRC_URL"

echo "==> tracing"
"$WORK/venv/bin/python" - "$WORK/caveat.woff2" "$OUT" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

src, out = sys.argv[1], sys.argv[2]

# The notes, and the names they get in the generated file.
PHRASES = [
    ("CARRIED", "third day running"),
    ("FLIPPED", "see? it came with you"),
]

# 600, not 400. These sit at ~20px beside 14px body text, and Caveat's
# regular is too thin at that size to read as a deliberate pen mark rather
# than a rendering artefact.
WEIGHT = 600

# The em the outlines are emitted on. Coordinates are rounded to whole
# units, so this is a precision/size trade: 1000 costs 14.5 kB gzipped,
# 100 costs 9.7 kB but starts to facet if a note is ever rendered large.
# 200 keeps the worst-case rounding error under 0.15px at 60px — well
# under a device pixel — for 11.4 kB.
EM = 200

font = TTFont(src)
font = instancer.instantiateVariableFont(font, {"wght": WEIGHT}, inplace=False)
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()
hmtx = font["hmtx"]
upem = font["head"].unitsPerEm
ascender = font["hhea"].ascender
descender = font["hhea"].descender


def kern_pairs():
    """Flat {(left, right): xAdvance} from GPOS format-1 pair positioning.

    Caveat is a joining script and reads visibly wrong unkerned, so this is
    not an optimisation. Only format 1 (explicit pairs) is handled; format 2
    (class pairs) is ignored, which is why the output is spot-checked by eye
    rather than trusted outright.
    """
    pairs = {}
    if "GPOS" not in font:
        return pairs
    for lookup in font["GPOS"].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if getattr(st, "LookupType", None) == 9 and hasattr(st, "ExtSubTable"):
                st = st.ExtSubTable
            if getattr(st, "Format", None) == 1 and hasattr(st, "PairSet"):
                for left, ps in zip(st.Coverage.glyphs, st.PairSet):
                    for rec in ps.PairValueRecord:
                        v = getattr(rec.Value1, "XAdvance", 0) or 0
                        if v:
                            pairs[(left, rec.SecondGlyph)] = v
    return pairs


KERN = kern_pairs()
scale = EM / upem


def layout(text, pen):
    """Draw `text` into `pen`, in SVG coordinates."""
    x = 0.0
    prev = None
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            # A space has no outline; advance by the font's own space width
            # if it has one, and a quarter em if it does not.
            space = cmap.get(0x20)
            x += hmtx[space][0] if space else upem * 0.26
            prev = None
            continue
        if prev is not None:
            x += KERN.get((prev, name), 0)
        # y flips: font coordinates are y-up, SVG is y-down.
        glyphs[name].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, x * scale, 0)))
        x += hmtx[name][0]
        prev = name


def render(text):
    """Path data plus a viewBox taken from the real ink, not the advances.

    The advance-width box clipped the last letter of both notes. Caveat is a
    joining script: its strokes routinely overhang the advance on both sides,
    and the final `u` of "see? it came with you" lost its exit stroke. A
    vertical box from the ascender and descender is wrong the other way — it
    reserves room for glyphs neither phrase contains, so the note floats in
    a tall transparent band and cannot be aligned against anything.

    PAD is a hair of room so antialiasing at the extremes is not shaved off
    by the viewport edge.
    """
    PAD = 2
    pen = SVGPathPen(glyphs, ntos=lambda v: str(int(round(v))))
    layout(text, pen)
    bounds = BoundsPen(glyphs)
    layout(text, bounds)
    x0, y0, x1, y1 = bounds.bounds
    return (
        pen.getCommands(),
        round(x0 - PAD),
        round(y0 - PAD),
        round(x1 - x0 + 2 * PAD),
        round(y1 - y0 + 2 * PAD),
    )


entries = []
for const, text in PHRASES:
    d, x0, y0, width, height = render(text)
    entries.append((const, text, d, x0, y0, width, height))

with open(out, "w") as f:
    f.write("""/**
 * The two handwritten notes in the welcome hero, as outlines.
 *
 * GENERATED by tools/build-notes.sh. Do not edit by hand — change the
 * phrase in that script and re-run it.
 *
 * These are Caveat at weight 600, traced to SVG paths at build time so the
 * app ships no second webfont. The reasoning, and the measurements that
 * chose outlines over a subset, are in that script and in
 * docs/RETHEME-PLAN.md D1.
 *
 * Each note is decoration and carries no information the page does not
 * already say in real text, so every call site renders it `aria-hidden`.
 */

export interface HandwrittenNote {
  /** What it says, for the comment at the call site and for specs. */
  readonly text: string;
  /** Single `d` for the whole phrase, already kerned and laid out. */
  readonly path: string;
  readonly viewBox: string;
  /** Width in viewBox units, for `aspect-ratio` at the call site. */
  readonly width: number;
  readonly height: number;
}

""")
    for const, text, d, x0, y0, width, height in entries:
        f.write(f"export const {const}_NOTE: HandwrittenNote = {{\n")
        f.write(f"  text: '{text}',\n")
        f.write(f"  path:\n    '{d}',\n")
        f.write(f"  viewBox: '{x0} {y0} {width} {height}',\n")
        f.write(f"  width: {width},\n")
        f.write(f"  height: {height},\n")
        f.write("};\n\n")

print(f"    wrote {out}")
for const, text, d, *_ in entries:
    print(f"    {const}: {len(d)} B  '{text}'")
PY

npx prettier --write "$OUT" >/dev/null 2>&1 || true
echo "    done."
