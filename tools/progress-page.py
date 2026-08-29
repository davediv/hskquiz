#!/usr/bin/env python3
"""
Builds progress/index.html — the contact sheet of the build.

Reads progress/status.json (written by the orchestrator after each loop) and the screenshots in
progress/shots/loop-N/, inlines the images as JPEG data URIs, and emits a single self-contained
page suitable for publishing as an Artifact.

  python3 tools/progress-page.py
"""
import base64
import io
import json
import os
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "progress" / "shots"
OUT = ROOT / "progress" / "index.html"
STATUS = ROOT / "progress" / "status.json"

THUMB_W = 460          # rendered at ~230 CSS px on a 2x phone
QUALITY = 74


def data_uri(path, width=THUMB_W, quality=QUALITY):
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return None
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def esc(s):
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


status = json.loads(STATUS.read_text()) if STATUS.exists() else {"loops": []}
loops = sorted(status.get("loops", []), key=lambda x: -int(x["loop"]))

# ---------------------------------------------------------------- assemble frames
total_bytes = 0
for lp in loops:
    d = SHOTS / f"loop-{lp['loop']}"
    by_piece = {v["piece"]: v for v in lp.get("verdicts", [])}
    frames = []
    seen = set()
    files = sorted(d.glob("*-mobile.png")) if d.exists() else []
    for f in files:
        piece = f.name[: -len("-mobile.png")]
        # a critic may shoot extra states, e.g. quiz-card-answered-mobile.png
        base = piece
        while base and base not in by_piece and "-" in base:
            base = base.rsplit("-", 1)[0]
        v = by_piece.get(base, {})
        uri = data_uri(f)
        if not uri:
            continue
        total_bytes += len(uri)
        desk = f.with_name(f.name.replace("-mobile.png", "-desktop.png"))
        frames.append(
            {
                "piece": piece,
                "base": base,
                "shot": uri,
                "desktop": data_uri(desk, 720, 68) if desk.exists() else None,
                "pass": v.get("pass"),
                "gap": v.get("biggestGap", ""),
                "kind": v.get("kind", ""),
                "primary": piece == base,
            }
        )
        seen.add(base)
    # pieces with a verdict but no screenshot (data/logic pieces have no surface)
    for v in lp.get("verdicts", []):
        if v["piece"] not in seen:
            frames.append(
                {
                    "piece": v["piece"],
                    "base": v["piece"],
                    "shot": None,
                    "desktop": None,
                    "pass": v.get("pass"),
                    "gap": v.get("biggestGap", ""),
                    "kind": v.get("kind", ""),
                    "primary": True,
                }
            )
    lp["frames"] = frames

# ---------------------------------------------------------------- markup
def chip(p):
    if p is True:
        return '<span class="chip chip--pass">at bar</span>'
    if p is False:
        return '<span class="chip chip--fail">below bar</span>'
    return '<span class="chip chip--none">unjudged</span>'


bands = []
for lp in loops:
    vs = lp.get("verdicts", [])
    passing = sum(1 for v in vs if v.get("pass"))
    note = esc(lp.get("note", ""))
    cells = []
    for fr in lp["frames"]:
        img = (
            f'<button class="frame__img" data-full="{fr["desktop"] or fr["shot"]}" '
            f'aria-label="Open {esc(fr["piece"])} full size">'
            f'<img src="{fr["shot"]}" alt="{esc(fr["piece"])} at 375px" loading="lazy"></button>'
            if fr["shot"]
            else f'<div class="frame__img frame__img--none"><span>{esc(fr["kind"] or "no surface")}</span></div>'
        )
        cells.append(
            f"""<figure class="frame">
	{img}
	<figcaption class="frame__cap">
		<span class="frame__name">{esc(fr["piece"])}</span>{chip(fr["pass"])}
	</figcaption>
	{f'<p class="frame__gap"><span>Biggest gap</span>{esc(fr["gap"])}</p>' if fr["gap"] else ""}
</figure>"""
        )
    bands.append(
        f"""<section class="band">
	<header class="band__head">
		<h2 class="band__no">Loop <em>{esc(lp["loop"])}</em></h2>
		<p class="band__score"><strong>{passing}</strong> of {len(vs)} pieces at the bar</p>
		{f'<p class="band__note">{note}</p>' if note else ""}
	</header>
	<div class="sheet">{"".join(cells)}</div>
</section>"""
    )

latest = loops[0] if loops else None
lvs = latest.get("verdicts", []) if latest else []
lpass = sum(1 for v in lvs if v.get("pass"))

HTML = f"""<title>HSK Quiz Contact Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
:root {{
	--paper: #f4f3ef;
	--sheet: #ffffff;
	--edge: #ddddd6;
	--ink: #16181b;
	--ink-soft: #5b615e;
	--ink-faint: #8b918d;
	--jade: #1f6f5c;
	--jade-lift: #2e8f76;
	--pass: #3f8f5f;
	--fail: #b4443a;
	--shadow: 0 1px 2px rgb(22 24 27 / 0.06), 0 8px 24px -12px rgb(22 24 27 / 0.18);
}}
@media (prefers-color-scheme: dark) {{
	:root:not([data-theme="light"]) {{
		--paper: #14171a;
		--sheet: #1b1f22;
		--edge: #2b3135;
		--ink: #e9eae6;
		--ink-soft: #9aa39e;
		--ink-faint: #6d7873;
		--jade: #4fbfa0;
		--jade-lift: #6fd8ba;
		--pass: #5cb87c;
		--fail: #e0705f;
		--shadow: 0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6);
	}}
}}
:root[data-theme="dark"] {{
	--paper: #14171a;
	--sheet: #1b1f22;
	--edge: #2b3135;
	--ink: #e9eae6;
	--ink-soft: #9aa39e;
	--ink-faint: #6d7873;
	--jade: #4fbfa0;
	--jade-lift: #6fd8ba;
	--pass: #5cb87c;
	--fail: #e0705f;
	--shadow: 0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6);
}}

* {{ box-sizing: border-box; }}
body {{
	margin: 0;
	background: var(--paper);
	color: var(--ink);
	font: 400 16px/1.55 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
	-webkit-font-smoothing: antialiased;
	padding: 0 0 5rem;
}}
.wrap {{ max-width: 1180px; margin: 0 auto; padding: 0 1.15rem; }}

/* ---- masthead ---- */
.mast {{ padding: 2.6rem 0 1.6rem; border-bottom: 1px solid var(--edge); }}
.mast__eyebrow {{
	margin: 0 0 .7rem;
	font: 500 .7rem/1 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .16em;
	text-transform: uppercase;
	color: var(--jade);
}}
.mast__title {{
	margin: 0;
	font-family: Fraunces, ui-serif, Georgia, serif;
	font-weight: 600;
	font-size: clamp(2.1rem, 7vw, 3.4rem);
	line-height: 1.02;
	letter-spacing: -.02em;
	text-wrap: balance;
}}
.mast__title em {{ font-style: normal; color: var(--jade); }}
.mast__sub {{
	margin: .85rem 0 0;
	max-width: 56ch;
	color: var(--ink-soft);
	font-size: .96rem;
}}
.tally {{
	display: flex;
	flex-wrap: wrap;
	gap: .5rem 1.9rem;
	margin: 1.5rem 0 0;
	padding: 0;
	list-style: none;
}}
.tally div {{ display: flex; flex-direction: column-reverse; gap: .12rem; }}
.tally dt {{
	font: 500 .66rem/1.3 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .13em;
	text-transform: uppercase;
	color: var(--ink-faint);
}}
.tally dd {{
	margin: 0;
	font-family: Fraunces, ui-serif, Georgia, serif;
	font-weight: 600;
	font-size: 1.85rem;
	line-height: 1;
	font-variant-numeric: tabular-nums;
}}

/* ---- loop bands ---- */
.band {{ padding: 2.4rem 0 .6rem; border-bottom: 1px solid var(--edge); }}
.band__head {{ margin: 0 0 1.35rem; }}
.band__no {{
	margin: 0;
	font: 500 .72rem/1 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .18em;
	text-transform: uppercase;
	color: var(--ink-faint);
}}
.band__no em {{
	font-style: normal;
	color: var(--ink);
	font-size: 1.05rem;
}}
.band__score {{
	margin: .45rem 0 0;
	font-family: Fraunces, ui-serif, Georgia, serif;
	font-size: 1.3rem;
	font-weight: 400;
	color: var(--ink-soft);
}}
.band__score strong {{ color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }}
.band__note {{ margin: .5rem 0 0; max-width: 62ch; color: var(--ink-soft); font-size: .93rem; }}

/* ---- the sheet ---- */
.sheet {{
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
	gap: 1.5rem 1.15rem;
}}
.frame {{ margin: 0; display: flex; flex-direction: column; gap: .55rem; }}
.frame__img {{
	display: block;
	width: 100%;
	padding: 0;
	border: 1px solid var(--edge);
	border-radius: 3px;
	background: var(--sheet);
	box-shadow: var(--shadow);
	cursor: zoom-in;
	overflow: hidden;
	aspect-ratio: 375 / 812;
}}
.frame__img img {{ display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }}
.frame__img:focus-visible {{ outline: 2px solid var(--jade); outline-offset: 3px; }}
.frame__img--none {{
	display: grid;
	place-items: center;
	aspect-ratio: 375 / 812;
	cursor: default;
	background: repeating-linear-gradient(
		135deg, transparent 0 7px, color-mix(in srgb, var(--edge) 55%, transparent) 7px 8px);
}}
.frame__img--none span {{
	font: 500 .65rem/1 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .12em;
	text-transform: uppercase;
	color: var(--ink-faint);
}}
.frame__cap {{ display: flex; align-items: baseline; gap: .5rem; flex-wrap: wrap; }}
.frame__name {{
	font: 500 .78rem/1.2 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .01em;
}}
.chip {{
	font: 500 .6rem/1 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .1em;
	text-transform: uppercase;
	padding: .27rem .42rem;
	border-radius: 2px;
	white-space: nowrap;
}}
.chip--pass {{ color: var(--pass); background: color-mix(in srgb, var(--pass) 13%, transparent); }}
.chip--fail {{ color: var(--fail); background: color-mix(in srgb, var(--fail) 13%, transparent); }}
.chip--none {{ color: var(--ink-faint); background: color-mix(in srgb, var(--ink-faint) 12%, transparent); }}
.frame__gap {{
	margin: 0;
	padding-left: .62rem;
	border-left: 2px solid var(--jade);
	color: var(--ink-soft);
	font-size: .82rem;
	line-height: 1.45;
}}
.frame__gap span {{
	display: block;
	font: 500 .58rem/1 "IBM Plex Mono", ui-monospace, monospace;
	letter-spacing: .13em;
	text-transform: uppercase;
	color: var(--jade);
	margin-bottom: .28rem;
}}

.empty {{ padding: 4rem 0; color: var(--ink-soft); font-size: 1rem; }}

/* ---- lightbox ---- */
dialog {{
	border: 0;
	padding: 0;
	background: transparent;
	max-width: 96vw;
	max-height: 94vh;
}}
dialog::backdrop {{ background: rgb(10 12 14 / .82); }}
dialog img {{
	display: block;
	max-width: 96vw;
	max-height: 94vh;
	border-radius: 3px;
	box-shadow: 0 24px 70px -20px rgb(0 0 0 / .7);
}}
@media (prefers-reduced-motion: no-preference) {{
	dialog[open] {{ animation: pop .16s ease-out; }}
	@keyframes pop {{ from {{ opacity: 0; transform: scale(.985); }} }}
}}
</style>

<div class="wrap">
	<header class="mast">
		<p class="mast__eyebrow">Builder / critic loop &middot; HSK 1&ndash;5</p>
		<h1 class="mast__title">Every loop, <em>side by side</em></h1>
		<p class="mast__sub">
			Each frame is the running app photographed at 375&nbsp;px by a critic with fresh context &mdash;
			never a builder&rsquo;s description of its own work. Newest loop first. Tap a frame to enlarge.
		</p>
		<dl class="tally">
			<div><dt>Loop</dt><dd>{esc(latest["loop"]) if latest else "&mdash;"}</dd></div>
			<div><dt>At the bar</dt><dd>{lpass}&thinsp;/&thinsp;{len(lvs) if lvs else 0}</dd></div>
			<div><dt>Loops run</dt><dd>{len(loops)}</dd></div>
			<div><dt>Words</dt><dd>4,316</dd></div>
		</dl>
	</header>
	{"".join(bands) if bands else '<p class="empty">No loops recorded yet.</p>'}
</div>

<dialog id="lb"><img alt="Enlarged screenshot"></dialog>
<script>
	const lb = document.getElementById('lb');
	const lbImg = lb.querySelector('img');
	document.querySelectorAll('.frame__img[data-full]').forEach((b) => {{
		b.addEventListener('click', () => {{
			lbImg.src = b.dataset.full;
			lbImg.alt = b.getAttribute('aria-label') || 'Enlarged screenshot';
			lb.showModal();
		}});
	}});
	lb.addEventListener('click', () => lb.close());
</script>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
kb = OUT.stat().st_size / 1024
print(f"wrote {OUT}  {kb:,.0f} KB  ({len(loops)} loops, {sum(len(l['frames']) for l in loops)} frames)")
if kb > 15000:
    print("WARNING: approaching the 16 MB artifact ceiling — drop THUMB_W or QUALITY")
