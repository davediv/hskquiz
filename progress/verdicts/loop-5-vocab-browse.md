# Loop 5 — vocab-browse

**Verdict: does not pass.** The screen's *content* is now at reference standard and the blind judge
says so decisively. Its *chrome* is not: three separate, independently reproduced layout faults all
live in the mobile sticky header, and two of them are visible on every common iPhone width at every
scroll depth.

## Blind judge — we won, and by a lot

`progress/blind/loop-5/vocab-browse/mapping.json`: **A was ours**, B was Pleco
(`reference/screenshots/pleco/pleco-iphone-01.png`). The judge picked **A — ours — with gap size
"large"**, and its ten-item `whatWeakerMustChange` list is aimed at **Pleco**, not at us. Nothing in
it is an instruction to this repo. Stated plainly: on the head-to-head at-rest frame, our list beats
the app we are being measured against.

What it credited: a committed warm off-white ground with one ink and one crimson accent; a real
typographic spine (level pill, search field, chips and rows all on the same ~20pt inset, meaning
column starting at a fixed x); a type ramp with genuine steps (~28pt hanzi / ~16pt pinyin / ~11pt
letterspaced POS caps / ~15pt meaning); 76–78pt rows; 45–47pt controls. "Those are decisions."
**Do not disturb any of it.**

What it charged against *us* (four items, all minor, all real):
1. Five tone hues at full chroma and unequal lightness — 爸爸 and 白天 "look bicoloured by accident"
   (visible in `progress/shots/loop-5/vocab-browse-mobile.png`).
2. The ~21pt dotted status circles are barely visible against the ground.
3. Both filter chips read "500" — the redundancy is on show.
4. Dividers overhang the content inset by a few points.

## Surviving findings

### 1. MAJOR — the chip strip clips, and the chip it clips is "Mastered"
The one number a returning learner opens this screen for is offscreen on every common phone width.
With all six buckets seeded, strip `scrollWidth` is 445 against a 375 `clientWidth`; the "40
Mastered" chip's box runs x=347→425 — 50px past the right edge, entirely invisible.
`progress/shots/loop-5/vocab-browse-chips-mobile.png` shows All / New / Shown / Learning / Shaky and
then a bare `›` chevron where Mastered should be. Identical at 414px. At 320px
(`vocab-browse-chips-320-mobile.png`) it is sliced mid-word to "Mas…" under the fade. Confirmed in
source: `src/lib/components/browse/status.ts:25` now lists **six** filters (a `seen`/"Shown" bucket
was added), while `src/lib/components/browse/StatusFilter.svelte`'s header comment still asserts
"brings all five inside 375px with room to spare… **None of it fires at 375px any more**." That
claim was measured against five chips and was never re-measured. This was the named rough edge for
loop 5 and it is open.

### 2. MAJOR — the level switch is permanently half-collapsed while scrolling
A ~14px band of beige track with the top arc of the black level pill poking out, wedged between the
title bar and the search field. It reads as a half-rendered control.
`vocab-browse-scroll120-mobile.png`, `vocab-browse-scroll240-mobile.png`,
`vocab-browse-l5-deep-mobile.png` (scrollY 69,544) and `vocab-browse-l5-bottom-mobile.png` — four
independent captures, same artifact, unchanged across scrollY 60/120/180/300/900. Cause is in
`src/routes/browse/[level]/+page.svelte:806`: `--app-chrome-fold: 3.375rem` (54px) is documented as
"exactly the level-pills-and-count row," but the row is taller than that, so the fold hides ~85% of
the control and leaves the remainder onscreen forever instead of collapsing it. Nothing else on this
screen looks unfinished; this does.

### 3. MAJOR — 29% of the phone viewport is chrome before the first Chinese character
Three stacked control rows (level switch, search field, chip strip) push the first `[data-index]`
row to y=238 of 812. Pleco puts its first headword at ~8% of its viewport with a keyboard up
(`reference/screenshots/pleco/pleco-iphone-01.png`). Visible in `vocab-browse-mobile.png` — 爱 starts
a third of the way down a blank-search screen. Loop 4's blind judge flagged this at 22%; it has
grown to 29%. Two of the three rows are dead weight on first open: the chip strip reads "500 All /
500 New" (the same meaningless number twice) and the level switch prints "500 words" a third time.

### 4. MINOR — one example sentence per word where both references give three to five
`multiSentence = 0` across all 4,308 words. `example` is a single object, not an array, and the
eyebrow is singular. Pleco shows 几乎 with five sentences filling ~70% of the entry
(`reference/screenshots/pleco/pleco-iphone-02.png`); Du Chinese numbers three for 一边
(`reference/screenshots/duchinese/ui/duchinese-iphone-04-ui.png`). Ours shows one
(`vocab-browse-sheet-mobile.png`). One frame cannot show a pattern of use.

### 5. MINOR — nothing in the word sheet acts on the word you are looking at
`src/lib/components/browse/WordSheet.svelte:216` derives `practiseHref` from `browseLevel` and no
word id; :631 renders it as the only full-width button. In an app whose premise is practice weighted
toward past misses, the screen where you discover you don't know 安慰 cannot queue 安慰. Pleco's
per-entry toolbar leads with "+ flashcard"; Du Chinese's word popup offers Grammar / Dictionary /
Save.

### 6. MINOR — desktop sheet's left column runs dry
`vocab-browse-sheet-desktop.png`: the left column ends at "New · Not practised yet" around 70% down
while the right column overflows under the CTA bar, leaving the widest empty region on the screen.
Smaller than loop 4's version, still present.

### Closed, verified in pixels
Loop 4's headline gap is genuinely fixed. Shipped JSON: 500/770/969/999/1070 — **0 words without an
example**, against loop 4's 3,038; 4,308 distinct English lines, 4,250 distinct hanzi skeletons, 0
sentences missing the headword. 安慰 (the exact word loop 4 named) renders a real IN A SENTENCE block
in `vocab-browse-sheet-mobile.png`; 爱心 likewise in `vocab-browse-l3-sheet-mobile.png`. Rainbow
example pinyin, the dead cross-level URL rescue (`/browse/1?q=安慰`,
`vocab-browse-crosslevel-mobile.png`) and the four-line manual are all fixed.

## Biggest gap

**Collapse the mobile browse header from three stacked control rows into two, and make its scrolled
state binary — fully shown or fully gone.** Put the level control and the search field on a single
44px row (search flexing, level as a compact control at its leading edge — the "500 words" count is
already printed twice below, so drop it here), and put the six status chips on one line beneath it.
Replace `--app-chrome-fold: 3.375rem` in `src/routes/browse/[level]/+page.svelte:806` with a value
derived from the merged row's measured height so the fold either hides that row completely or does
not fire — no sliver.

Acceptance, all re-measured in the running app with all six buckets seeded (40 mastered / 30 shaky /
40 learning / 20 shown), not asserted in a comment:
- First `[data-index]` row top ≤ 160px of 812 at 375px wide (today: 238).
- The "Mastered" chip fully inside the viewport at **320px** with no gesture — strip `scrollWidth` ≤
  `clientWidth` at 320/375/414. Two chips deep, use count + label only on the selected chip, or drop
  the redundant "All" chip; whichever gets Mastered onscreen.
- Screenshots at scrollY 120 and 900 on HSK 5 showing zero pixels of the level control — no beige
  band, no pill arc.

Guard rails: do not touch the 76px rows, the type ramp, the tone-coloured pinyin, the inset spine or
the meaning column's fixed x. Those are exactly what won the blind test against Pleco, and this is a
chrome fix, not a redesign. And delete the false claim in `StatusFilter.svelte`'s header comment —
it is what let a six-chip regression ship as a five-chip guarantee.
