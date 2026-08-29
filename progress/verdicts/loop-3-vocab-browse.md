# loop 3 — vocab-browse

**Verdict: fail.** The list screen is the best screen in the app and beat Pleco head-to-head. The
word sheet is a dictionary index with no language in it, and that is the whole piece's job.

Loop 2's gap is closed and closed well. The CHARACTERS strip is a real inverted index: each card
carries the character's own gloss (安 "to set at ease", 1st tone), links to its headword entry
where one exists, lists its words with HSK badges, and tapping one navigates in place with a
labelled way back (`vocab-browse-sheet-mobile.png`, `-scrolled-`, `-followed-`). Loop 2's findings
2–7 all verified closed. Windowing holds at 90% of an 81,803px document with zero console errors.

## Surviving findings

### Major

1. **No example sentence anywhere in the piece.** The sheet's lower two thirds is more headwords.
   A learner finishes 安慰's entry never having seen 安慰 used. Confirmed in source: `grep -i
   sentence` over `src/lib` returns glosses and code comments only — `related.ts:8` even says
   *"Pleco spends its entry screen on example sentences we…"* and stops there.
   Evidence: `progress/shots/loop-3/vocab-browse-sheet-mobile.png` + `-scrolled-mobile.png` — the
   entire entry is headword, pinyin, VERB · ADJECTIVE, two senses, then twelve more headwords.
   Against the bar: `reference/screenshots/pleco/pleco-iphone-02.png` gives 几乎 four sentences
   over ~70% of the screen; `reference/screenshots/duchinese/ui/duchinese-iphone-04-ui.png` gives
   一边 three. `reference/README.md:72` names this explicitly as what Pleco's entry screen is.

2. **The strip names 69 words it will not let you reach.** Each card caps at 3–6 rows then prints
   an inert paragraph counting the rest. `CharacterCard.svelte:100-106` renders it as
   `<p class="more">`, not a button. Evidence: `vocab-browse-sheet-idiom-mobile.png` — "41 more
   HSK words use 一" / 路 10 / 平 10 / 安 8, none reachable; `vocab-browse-sheet-scrolled-mobile.png`
   — "5 more HSK words use 安". No other route exists: `/browse/{1..5}?q=安` finds 0/5/4/2/2.

3. **The headword scrolls away.** By the time you reach the strip — the reason the strip was
   built — 安慰, ān wèi and both senses are gone; the bar keeps "1 of 1,070" and three icons.
   Evidence: `vocab-browse-sheet-scrolled-mobile.png` (visible content is 安全/平安/晚安/一路平安/
   安排/慰 with nothing naming the word you opened). `.body` scrollHeight 962 vs clientHeight 576.
   `WordSheet.svelte:353-357` puts `.head` inside the scrolling `.body`. Pleco pins 几乎, PY, JP
   and the HSK badge above its DICT/CHARS/WORDS/SENTS bar and never moves them.

### Minor

4. **The last row is sliced through the glyphs.** `.body` maskImage `none`, `.foot` background
   transparent — nothing softens the cut. `vocab-browse-sheet-mobile.png` (晚安), `-followed-`
   (一路平安, cut through both hanzi and "yí lù píng ān"), `vocab-browse-sheet-desktop.png`.
   The blind judge told the *weaker* screen "never render a row sliced in half at the bottom
   edge"; our own sheet does it on every open.

5. **The drag grip is decorative.** `WordSheet.svelte:281` renders `.grip`, styled at 505 and 808;
   the file contains no `pointerdown`/`touchstart`/drag handler at all (grep: zero hits). Dragging
   it 200px up or 300px down leaves `.panel` at top 108 / height 704, unchanged.

6. **Desktop sheet is a 480px box under 960px of dead scrim** (`vocab-browse-sheet-desktop.png`):
   4 of 12 related rows visible, the 4th sliced, while the list behind it is a comfortable
   two-column layout.

7. **Cross-level hop silently re-points the CTA.** `WordSheet.svelte:192` derives `practiseHref`
   from the followed word's level, so an HSK 5 browse session that follows 安静 gets a black
   "Practise HSK 2" button (`vocab-browse-sheet-followed-mobile.png`, page chrome behind still
   reads "HSK 5 vocabulary"). The button is also word-agnostic — after building a character graph
   it still cannot practise the word on screen.

8. **Chips overflow at 320px** — "100 Mastered" sits 51px off-screen behind a 44px fade
   (`vocab-browse-chips-320-mobile.png` vs `vocab-browse-chips-375-mobile.png`, where all five
   read). Touch targets are 44px at both widths, so loop 2's target note is closed.

## Blind judge

**It preferred ours, by a large margin.** `progress/blind/loop-3/vocab-browse/mapping.json`: A =
ours (`vocab-browse-mobile.png`), B = `reference/screenshots/pleco/pleco-iphone-01.png`. The judge
called A "an art-directed screen" against "platform default with a dictionary poured into it,"
and singled out the fixed POS column, the inset hairlines, the single red accent and the hanzi's
genuine typographic rank. Its twelve-item change list is addressed to Pleco, not to us — say so
plainly, and do not manufacture a deficit from it.

Two of its asides do land on us and are already findings above: the five-hue tone palette on
pinyin is called our "least disciplined move," and "never render a row sliced in half at the
bottom edge" is finding 4. Its remaining notes on A — 500 appearing three times within 250px, the
~28px dashed status circle in a 44px world, the 76px search field pushing the first word below
440px — are worth a cheap pass but none is this loop's gap.

## Biggest gap

**Put the word in a sentence.** This is the one thing both references spend their entry screen on
and this piece spends none of. Add an example-sentence block to
`src/lib/components/browse/WordSheet.svelte`, above CHARACTERS, showing one or two sentences per
word in the three-tier treatment the app already owns — hanzi with the headword in bold,
tone-coloured pinyin, English underneath — reusing `Hanzi`/`Pinyin` so it costs no new visual
language. Source them at build time in `scripts/build-vocab.mjs` from Tatoeba's cmn–eng pairs
(CC BY 2.0 FR; add the credit to `VOCAB_ATTRIBUTION` in `src/lib/data/attribution.ts` beside
CC-CEDICT, which the footer already renders). Gate every candidate the way `reference/README.md`
gates everything else: keep a sentence only if every word in it segments to the shipped 4,308-word
corpus at or below the headword's own level; cap it at ~12 characters for L1–2 and ~18 for L3–5;
prefer the shortest survivor. Ship it as its own lazily-imported chunk keyed by word id so the
list route's payload does not grow. Words with no clean candidate get no block — an absent
section is honest, a machine-written sentence is not.

The character graph already made the sheet a graph rather than a leaf. Sentences are what make it
a place a learner stays.

While in that file, three cheap fixes in the same pass: make "N more HSK words use 安" a button
that expands the card (finding 2 — 69 words named and unreachable on one sheet); pin
headword + pinyin + level badge above the scrolling body (finding 3); and either wire `.grip` to
drag-dismiss or delete it (finding 5).
