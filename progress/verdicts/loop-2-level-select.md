# Verdict — level-select, loop 2

**PASS: no.** Three majors survive, one of them a regression that erases loop 1's headline fix
the first time the app is used. The blind judge preferred our screen by a large margin — but it
only ever saw the first-time state, which is the one state the regression spares.

## Blind design judge

Ours was **A**; the reference (Du Chinese, `reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`)
was **B**. The judge picked **A**, gap size **large**: *"A is designed; B is a template with good
photos in it."* Its `whatWeakerMustChange` list is addressed to Du Chinese, not to us — there is no
deficit to import from it, and none is manufactured below.

What the judge praised is worth naming precisely, because finding 1 destroys it:
*"Chinese gets real presence twice — the display title, plus three ~48px sample words inside each
level card with red pinyin and gray gloss, so the card demonstrates the language instead of
describing it."* That is the whole basis of the win, and it holds only until a learner practises.

The judge's own criticisms of A land on findings 2 and 6 below: *"the top ~45% is three stacked gray
paragraphs before anything is tappable, one of them developer copy about 4,308 of 4,316 entries,
and Browse is a ~100x28 underlined link sitting beside a 72px button."*

## Surviving findings

### Major

**1. The meter evicts the preview words, so the level being studied is the one with no Chinese on it.**
`src/lib/components/levels/LevelCard.svelte` renders `{#if started}` → meter, `{:else}` → the
three-word row; the two share one slot and the comment says so outright. With 42 practised L1 words
and 7 L3 words seeded into `hskquiz:progress:v1`,
`progress/shots/loop-2/level-select-progress-mobile.png` shows the HSK 1 card — the card carrying the
`Continue` chip and the page's only filled Practise button — as a grey rail plus `42 of 500 · 8 mastered`
and zero hanzi. The first hanzi inside any card is then 超市, over on HSK 2. Loop 1's finding 3 ("the
level list contains no Chinese vocabulary") is genuinely closed for a first-time visitor and the 15
preview words verify level-correct against `reference/hsk/hsk30-official-L{1..5}.json` — and it
re-opens on the busiest card after one session. Card heights split 192px practised / 239px unpractised,
so the list stops reading as one list.

**2. 45% of the first phone screen is preamble, and it grew since loop 1.**
At 375x812 the first card's top is y=365 (loop 1: 331); 1.8 of 5 cards are reachable without
scrolling and the document is 1827px = 2.25 viewports (loop 1: 2.08). At 320x568 the first card
starts at y=400 — `progress/shots/loop-2/level-select-320-mobile.png` shows HSK 1 42% visible with
70% of the screen given to masthead. The stack above the first card: wordmark, eyebrow, 48px 词汇练习,
pinyin, 2-line tagline, 2-line homograph footnote, hairline, storage line, hairline, band heading.
Du Chinese fits an eyebrow, a two-line title, a level dot, a count, a hero image, a 3-line
description, three article thumbnails *and* a full-width primary button in one screen.

**3. 84% of every level card is dead to touch.**
The card is 335x239 = 80,028px²; all `a`/`button` descendants total 12,634px² (a 227x45 Practise pill
plus a 54x44 Browse link) = 16%. Tapping the 谢谢 hanzi and the "Greetings, numbers, family" blurb
inside the HSK 1 card left the URL unchanged. The `<article>` in `LevelCard.svelte` is not a link and
contains no full-bleed target. Du Chinese's collection card and its thumbnails are tappable whole;
Pleco's entire result row is the target (`reference/screenshots/pleco/pleco-iphone-01.png`).

### Minor

**4. HSK 1 spends a third of its Chinese on 八.**
`progress/shots/loop-2/level-select-mobile.png`: the card every visitor lands on shows 谢谢 / 八 / 妈妈
at 36px. 八 is two strokes glossed "eight" — no visitor learns anything — and it is a numeral, the
same class of glyph loop 1 stripped from this card for reading as bars. `preview.ts` picks "one word
per clause of the blurb" ("Greetings, numbers, family"), so the rule itself is producing the weak word.

**5. Fifteen real HSK words on screen, none of them touchable.**
Each preview word is a plain `<li>` of three spans — no link, no audio, no way into the word. A
learner who sees 效率 on the HSK 4 card has to leave the app to find out what it means beyond the
gloss. Pleco makes every headword an openable row (`pleco-iphone-01.png` → `pleco-iphone-02.png`).

**6. The homograph caveat is correct, and parked in the most valuable 46px on the phone.**
Loop 1's FAIL 1 is closed and verified independently: shipped 500/770/969/999/1070 = 4,308 against
official 500/772/973/1000/1071 = 4,316, an 8-row gap, with the merges named in `src/lib/data/sizes.ts`
and the hero printing exactly that. But it renders at 12px over two lines above every level — a
lexicography footnote outranking the app's content. The blind judge independently called it out as
"developer copy". The footer already cites 《国际中文教育中文水平等级标准》(GF 0025-2021); that is where it belongs.

**7. The desktop left rail is 61% empty in the reviewed state.**
`progress/shots/loop-2/level-select-desktop.png` at 1440x900: rail content ends at y≈353 while the
cards column runs to y=889, leaving ~340x540px blank. Loop 1's finding 6 is substantially closed —
two columns now, all five cards above the 900px fold — but the rail only fills once progress exists.

## Biggest gap

**Stop letting the progress meter evict the preview words in `src/lib/components/levels/LevelCard.svelte`.**
Delete the `{#if started}` / `{:else}` swap. Render the three-word row in **every** state, and demote
the meter to a single hairline row directly under the card header: a 4px rule plus
`42 of 500 · 8 mastered · 75% · 1h ago` at 12px. That restores hanzi to the card the learner actually
uses — today the `Continue` card is the one card on the page with no Chinese on it — and gives all
five cards one height instead of 239px/192px, so the list reads as one list again. Then make the
now-permanent row earn its slot: once a level has progress, source its three words from that
learner's own weakest records for that level (`progress.state.byWord`, highest `lastMissed`), falling
back to the static `LEVEL_PREVIEW` only at zero progress — so the card says "here is what you keep
missing in HSK 4" instead of showing 效率 / 学术 / 传统 forever, and the screen finally delivers what
its own tagline promises.
