# Loop 4 — level-select

**Verdict: not passing.** Two majors survive, and the worse of the two is a defect the
reference apps do not have: the app renders the learner's *own* words worse than the
hand-picked demo words.

## Blind judge — it preferred ours, decisively

`progress/blind/loop-4/level-select/mapping.json`: A = ours
(`progress/shots/loop-4/level-select-mobile.png`), B = the reference (Du Chinese Articles,
`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`). The judge, not told which
was which, picked **A, gap "large"** — "A reads as authored; B reads as assembled from
platform defaults." It named the Chinese presence as decisive: our 词汇练习 / 初等 / the
36px specimens against B's single 13px 新 badge. It also credited the one-accent discipline,
the hairline cards, the black/ghost pill pair, and the shared left inset.

So `whatWeakerMustChange` is aimed at Du Chinese, not at us. No deficit is being
manufactured from it. But the judge volunteered three faults in A unprompted, and **all
three are already on the critic's list** — BROWSE→ reads as a caption on the third
specimen, the 0% capsule "communicates nothing", and the tone palette is too many hues with
no key. Two independent observers converging is why those stay on the list below rather
than getting discounted as taste.

## Surviving findings

### Major — the learner's own words get cut; the demo words never do
`progress/shots/loop-4/level-select-gloss-small.png` (320×812, HSK 1 weak set seeded with
地/的/个): all three glosses clipped at once — "turns a word into an…" / "marks pos-session
like…" / "measure word: gene…" under YOU KEEP MISSING. Same defect at 1440 in
`progress/shots/loop-4/level-select-longwords-desktop.png`: 吗's column is 52px and "makes a
sentence a yes-no question" sets as "makes a sen-…". Measured rate: 10/60 personalised cards
clipped at 320, 3/60 at 1440. The static trio never clips because `preview.ts` picked it to
fit. Loop 3's assigned gap is otherwise genuinely closed — hanzi is 36px everywhere, pinyin
is never cut, cards are 298–299px uniform — but the app still degrades the more it is used,
which is the exact failure loop 3 was told to end.

### Major — the header still costs a third of the first screen, and the page grew
375×812 cleared: first card top 234px (28.8%), first Practise 471px, document **2,074px** for
five items — loop 3 measured 273px/2,054px, so the card rose ~40px and the document got
longer. Seeded: card top 299px (36.8%), document 2,139px. At 320×568 the first card top is
265 of 568. Third loop this has been named. And the largest Chinese on the page is still the
48px hero 词汇练习 — 汇 is HSK 4 (`src/lib/data/hsk4.json`) — so an HSK 1 beginner's biggest
glyphs are ones they cannot read.

### Minor — the whole card body commits to a 10-question session
Coordinate clicks at 375×812 send the blurb, the title and the count line all to `/quiz/N`;
nothing marks them as a button, and `progress/shots/loop-4/level-select-pressbody-mobile.png`
shows the press feedback landing on a Practise pill ~700px below the finger. Both references
use the full-surface target for *reading*, not for committing.

### Minor — the 0% track still reads as the heading's underline
`level-select-mobile.png`, `level-select-full-mobile.png`: five identical 6px hairlines. The
`.hskq-track-empty` inset ring is genuinely there (visible at 3×), but at 1× it is the
divider it was last loop. Du Chinese paints a filled end-cap at 0/12. The blind judge called
this out independently.

### Minor — every card leads with a zero on the state weighted hardest
`level-select-full-mobile.png`: meter + "0 of 500 practised" occupies y=250–276 of a 299px
card, five times; the one line that helps a newcomer choose sits below it at 14px grey.
Loop 3's difficulty-encoding finding IS closed — 初等 / 中等 band headings now group 1–3 and 4–5.

### Minor — desktop left-rail void unchanged (~334px)
`level-select-desktop.png`: `.hskq-colophon` ends y=426, grid ends y=760, document 903 vs a
900 viewport.

### Minor — per-level counts contradict the official list 1,255px before the reconciliation
Cards print 770/969/999/1,070 vs 772/973/1000/1071 in `reference/hsk/hsk30-official-L{2..5}.json`.
The colophon now reconciles the 8 exactly and sits above the fold on desktop (y=329); on
mobile it is at y=1,825 against HSK 2's count at y≈570.

### Minor — personalised row silently reverts to stock words
`level-select-longwords-desktop.png`: HSK 2 reads "36 of 770 · 30 mastered · 84%" while
printing 超市/周末/地铁 under a plain BROWSE. Honest (`fitPreview` returns null rather than
lying) and rare on a random draw, but a learner's misses are not a random draw.

### Minor — tone colour with no key on a screen where nobody reads tone
`level-select-desktop.png`: 15 pinyin strings across four saturated hues plus the hero, on a
page whose accent is otherwise one red. Pleco colours the *character*; Du Chinese sets pinyin
in one blue. Raised by the blind judge too.

## Biggest gap

**Take the English out of the three preview columns in
`src/lib/components/levels/LevelCard.svelte` and set the three glosses as one wrapped line
across the full card width beneath the row.**

Keep hanzi + pinyin in the existing `grid-template-columns: repeat(3, minmax(min-content, 1fr))`
— those are provably never cut at any width tested. Delete the per-column
`.hskq-gloss` / `.hskq-gloss-text` box (with its `min-block-size` reservation and its
`-webkit-line-clamp`) and emit one `<p>` after the `<ul>` reading
`thank you · mother · to like`, clamped at three lines at the card's full inline width.

This is the one change that makes the learner's own words render as well as the hand-picked
ones at every viewport. A 77px column cannot hold "measure word: general purpose" and never
will; a 301px line holds all three glosses at once. It is the shape Pleco already uses — the
definition gets the whole row, which is why "sb.'s original handwriting or painting" (37
chars) sets on one line in `reference/screenshots/pleco/pleco-iphone-01.png`. It also removes
the two-line gloss box reserved on all five cards, roughly 170px off the 2,074px mobile
document, which is the only structural saving left on the second major.

Verify at **320×568 first**, with HSK 1's weak set seeded to one-character function words
(地 / 的 / 个 / 吧 / 杯 / 号) — that is the case that currently clips all three columns
simultaneously, and 188 of the 936 single-character words shipped carry glosses longer than
18 characters, so it is not an edge case. Then re-check 375 and 1440, and confirm
`fitPreview` no longer needs to fall back to the stock trio on the long-word seed
(`level-select-longwords-*`), since the English no longer contributes to column width at all.
