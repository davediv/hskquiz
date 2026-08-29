# Verdict — level-select, loop 1

**Result: does not pass.** The screen is well-made and beat the reference head-to-head on
typography, but it ships a factual contradiction against the standard it cites, and its level
list contains no Chinese vocabulary.

## Blind judge

The blind judge preferred **ours**, and by a "large" gap. Per
`progress/blind/loop-1/level-select/mapping.json`, **A was our app**
(`progress/shots/loop-1/level-select-mobile.png`) and B was the Du Chinese Articles collection
screen (`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`). Its
`whatWeakerMustChange` list is therefore **addressed to Du Chinese, not to us** — it is not an
instruction for this codebase and carries no weight here.

Say it plainly: on this one screen we are ahead of the reference. The judge credited a real
four-tier type ramp with weight contrast, hanzi as the hero object, one disciplined crimson
accent, a consistent 40px gutter, and a clear primary/secondary button split — against B's
two-tier ramp, three unrelated accent hues, drifting spacing and a carousel card clipped
mid-word.

That verdict does not make the screen finished. The judge's own reservations about A —
"the empty progress track repeated on every card is pure noise until there is data", "the single
white bar in the HSK 1 tile reads as a minus sign, not a level", "two identical ELEMENTARY
eyebrows in a row", "the '500 / words' numeral baseline-aligns to nothing" — land on exactly the
same defects the critic found while running the app. Two independent reviewers converging is why
these survive.

## Surviving findings, ranked

### 1. FAIL — the headline count contradicts the standard cited in the footer

The hero reads "4,307 words" over cards printing 500 / 769 / 969 / 999 / 1070. I diffed the
shipped JSON against the reference lists myself:

| Level | Official | Shipped | Δ |
|---|---|---|---|
| 1 | 500 | 500 | 0 |
| 2 | 772 | 769 | −3 |
| 3 | 973 | 969 | −4 |
| 4 | 1000 | 999 | −1 |
| 5 | 1071 | 1070 | −1 |
| **Total** | **4,316** | **4,307** | **−9** |

Three inches below, the footer cites 《国际中文教育中文水平等级标准》(GF 0025-2021) — the source
that says 4,316. The merge itself is legitimate and well documented in `src/lib/data/sizes.ts`:
nine official rows are same-pinyin homographs collapsed to one card, while distinct-pinyin
homographs (长 cháng / 长 zhǎng) are correctly kept apart. Shipping the merged figure unlabelled
under that citation is what fails. Anyone who knows HSK reads it as a broken word list.
Evidence: `progress/shots/loop-1/level-select-full-mobile.png`.

### 2. MAJOR — three of five level marks do not read as Chinese

Confirmed by eye in `progress/shots/loop-1/level-select-full-mobile.png` and at 8x in
`progress/shots/loop-1/level-select-tile-1.png` / `-tile-3.png`: 一 in a 48px crimson square is a
white bar on red — the international "no entry" sign — and 三 is three stacked bars, a hamburger
menu, inside a tappable card. Only 四 and 五 read as characters, so the set is inconsistent as
well as illegible. `LevelCard.svelte:48-49` comments "The numeral tile is where this card speaks
Chinese"; on the level the app recommends with "Start here", that tile is a stop sign. The blind
judge, with no access to the code, independently flagged the same tile.

### 3. MAJOR — the level list contains no Chinese vocabulary

Five hanzi on the whole list, every one a numeral. Swap the content for Spanish CEFR levels and
nothing else on the screen would need to change. `levelMeta.ts` already carries `bandHanzi`
('初等'/'中等') for all five levels and `LevelCard.svelte:50` renders `meta.band` instead — the
Chinese is loaded and thrown away. Pleco makes the hanzi the largest object on screen
(`reference/screenshots/pleco/pleco-iphone-02.png`).

### 4. MAJOR — no primary action in the first-time state

Ten equal-weight CTAs: five identical black "Practise" pills, five identical outlined "Browse"
buttons, in five cards of identical 222px height and identical internal layout. The only
differentiator is a small pale-pink "Start here" chip beside the H2 — not on the button.
Du Chinese ships one full-width red "Open Collection" and keeps everything above it quiet.

### 5. MAJOR — the empty state paints ten pieces of zero-information chrome

Five 8px tracks with no fill element at all (`LevelCard.svelte:70` renders the fill only when
`pct > 0`), each followed by "Not practised yet". A flat grey rail with no origin is
indistinguishable from a hairline divider. Du Chinese at zero progress still prints
"0/12 chapters read" against a track with a filled cap: an origin and a countable target.

### 6. MAJOR — desktop is the phone layout with a caption pinned beside it

`progress/shots/loop-1/level-select-full-desktop.png` shows it clearly: a 960px content grid at
1440px wide, the sticky rail 255px tall inside a 1,165px column, leaving ~910px (78%) of the left
column empty, and the page still scrolls 1.6 viewports. The 480px of unused horizontal space
would hold a second column and put all five levels above the fold.

### 7. MINOR — hero eats 41% of the first phone screen

First card top at 331px; only 2 of 5 levels reachable without scrolling; document 2.08 viewports.

### 8. MINOR — hero pinyin is wrong orthography

`src/routes/+page.svelte:87` hardcodes `cí huì liàn xí`. 汉语拼音正词法基本规则 joins syllables
within a word: **cíhuì liànxí**. This is the app's most prominent pinyin, 17px accent red under a
48px title, and it teaches the wrong habit on sight. Pleco writes "PY jīhū", not "jī hū".

### 9. MINOR — two competing headlines per card header

"HSK 1" at 21px/600 and "500" at 18px/600 in the same ink, same baseline row — the eye cannot
tell label from metadata. Compounded by "ELEMENTARY" repeating on three consecutive cards where
one group heading would do. The blind judge flagged both independently.

## Biggest gap

**Put real vocabulary on every level card, and make it the card's Chinese.**

In the zero-progress state, replace the empty 8px meter and the "Not practised yet" line with a
preview row of 3–4 actual words from that level: hanzi at 28–32px, pinyin beneath in accent
crimson (joined orthography — `cíhuì`, not `cí huì`), a short gloss under that. Swap the meter
back in only once `stats.practised > 0`, so the bar appears when it has something to say.

Respect the existing lazy-load contract while you do it: `src/lib/data/index.ts` deliberately
keeps all five chunks out of the landing page via `import.meta.glob`, and pulling 640KB of JSON
to render fifteen words would undo that. Check in a small static preview constant beside
`sizes.ts` — 3–4 chosen words per level — the same way shipped counts are written out rather
than derived.

Then delete the 一/二/三/四/五 numeral tiles from `LevelCard.svelte` and let the preview hanzi be
the card's Chinese. The tile is the weakest element on the screen (a minus sign, an equals sign
and a hamburger menu) and the preview row makes it redundant.

One change, four findings closed: the list stops containing zero Chinese words (#3), the five
interchangeable cards become visibly different from one another (#4 in part), the emptiest state
gains content instead of five dead rails (#5), and the illegible numeral tiles go (#2).

Fix #1 in the same pass — it is a one-line labelling change ("4,307 cards from the 4,316-word HSK
3.0 list", or a footnote on the citation), not a redesign — but it is mandatory, not optional.
