# Verdict — vocab-browse, loop 4

**PASS: no.** The list screen beat Pleco head-to-head in a blind test this loop. The word sheet
behind it still ships empty for 70% of the vocabulary.

## Blind design judge — we won, and by a lot

`progress/blind/loop-4/vocab-browse/mapping.json`: **A was ours** (`vocab-browse-mobile.png`),
B was the reference (`reference/screenshots/pleco/pleco-iphone-01.png`). The judge picked **A**,
`gapSize: large`, and its `whatWeakerMustChange` list — hanzi at 36–40pt, luminance-matched tone
hues, 8pt spacing rhythm, inset hairlines, a title and result count, a row-level affordance —
is a list of instructions **for Pleco**, not for us. We already do every item on it.

Quoting it back, because it is the standard this piece is now being held to: *"A reads as a set
of decisions; B reads as stock iOS with a dictionary poured into it… A gives the character the
largest, quietest, highest-contrast mass on the row and pushes tone information out to the
pinyin, where colour is a secondary signal."* Do not redesign the list. Do not touch the ramp
(hanzi 28 / pinyin 17 / gloss 16 / POS 11), the two-column grid, the 76pt rows, or the inset
dividers. They are the reason we won.

The judge's four named weaknesses in **our** screen are real but small, and none is the gap:
three stacked filter controls eating 22% of the viewport, "500" printed three times, the ~24pt
dashed status circle sitting well under a 44pt target, and a Practise red that collides with
our own tone-4 red.

## Surviving findings

### 1. FAIL — HSK 3, 4 and 5 ship zero example sentences
3,038 of 4,308 words have no `example` field. Counted over the shipped JSON, not the source:
`hsk1 500/500 · hsk2 770/770 · hsk3 969→0 · hsk4 999→0 · hsk5 1070→0`. On screen in
`progress/shots/loop-4/vocab-browse-l5-sheet-mobile.png`: 安慰 runs headword → ān wèi →
VERB · ADJECTIVE → "1 to comfort / 2 to console" → hairline → CHARACTERS. No IN A SENTENCE
band, no placeholder, nothing. For those three levels the sheet is byte-for-byte the screen
loop 3 already failed — this was loop 3's assigned gap and it came back 29% closed.
`ExampleSentence.svelte`'s own header comment admits it: *"3,038 of the 4,308 shipped words
carry no sentence yet (HSK 3–5 have none)."*

Where the sentence exists it is excellent — `vocab-browse-sheet-long-mobile.png` shows 比如's
sentence wrapping cleanly, the headword carrying a sunken ground and an accent rule in **both**
the hanzi and the pinyin line, the English quiet underneath. That is what makes its absence at
L3–5 the loudest hole in the piece, and it is why the fix is extension, not design.
Bar: `reference/screenshots/pleco/pleco-iphone-02.png` gives 几乎 four sentences over ~70% of
the entry.

### 2. MAJOR — the cross-level rescue offer never renders from a URL query
`/browse/1?q=安慰` shows "Nothing in HSK 1 matches 安慰" forever
(`vocab-browse-search-crosslevel-mobile.png`). Type the same query after the page has warmed and
the HSK 5 card appears (`vocab-browse-search-crosslevel-typed-mobile.png`). Same app, same
query, same level — only the order of events differs. Confirmed root cause: `elsewhere`
(`src/routes/browse/[level]/+page.svelte:455`) calls `levelLists()`, which returns a plain
module-level `let lists` at `src/lib/components/browse/related.ts:82` — **not `$state`** — so the
`$derived.by` has no dependency on it and never re-runs when `ensureCharIndex()` resolves. The
dead path is the most common one into the feature: a shared link, a back-navigation, or the
app's own `?q=` hop.

### 3. MINOR — one sentence per word where the reference gives three to four
`multi-sentence words: 0` across all 1,270 examples; `example` is a single object
`{hanzi, pinyin, english}`, not an array, and the eyebrow is singular ("IN A SENTENCE").
Pleco stacks four for 几乎; `duchinese-iphone-04-ui.png` numbers three for 一边. One frame does
not make a pattern visible.

### 4. MINOR — the sentence pinyin outshouts the Chinese it annotates
On 爱's sheet: example hanzi 26px / weight 400 / monochrome rgb(26,24,21); example pinyin
17px / weight 500 across five hues. On a 12-syllable sentence that is a rainbow running the full
width and the only coloured thing on screen — see the wrapped
"wǒ xǐ huan hěn duō yùn dòng bǐ rú dǎ lán qiú" in `vocab-browse-sheet-long-mobile.png`. Neither
reference does this: Pleco sets example pinyin bold black, Du Chinese sets ruby pinyin small
grey. Loop 3's blind judge already called the five-hue palette our least disciplined move;
a sentence multiplies it by twelve.

### 5. MINOR — nothing in the sheet acts on the word you are looking at
The bar is ‹ › ✕ and the one full-width CTA is "Practise HSK 5" — all 1,070 words.
`practiseHref` (`WordSheet.svelte:215`) is derived from `browseLevel` alone and takes no word id.
In an app whose premise is weighted spaced practice, browse and quiz never connect at the word.
`pleco-iphone-05.png` leads its per-entry toolbar with "+ flashcard".
Evidence: `vocab-browse-l5-sheet-mobile.png`, `vocab-browse-sheet-desktop.png`.

### 6. MINOR — the four-line search manual stays above the rescue card
`emptyCopy.body` (`+page.svelte:483`) has no branch for `elsewhere.length > 0`, so the learner
reads a paragraph explaining how search works and only then meets the card that already answered
them. `vocab-browse-search-crosslevel-typed-mobile.png`.

### 7. MINOR — desktop sheet, left column empties under the sentence
At 1440×900 the left column ends at "I love my mum and dad." a little under halfway down while
the right column runs eight WORDS WITH 爱 rows to the fold — roughly the bottom 40% of the left
half is blank paper. `vocab-browse-sheet-desktop.png`. (The loop-3 version of this — a 480px box
under 960px of dead scrim — is genuinely fixed; this is the small remainder.)

## Biggest gap

**Author and ship an example sentence for every HSK 3, 4 and 5 word — all 3,038 of them — through
the pipeline that already produces the good L1–2 block.** Extend `scripts/build-vocab.mjs`'s level
gate; ~18 characters for L3–5; the headword present verbatim inside the sentence so `example.ts`
can mark it; `Hanzi`/`Pinyin` for the two Chinese lines; one English line under. Change nothing
about `ExampleSentence.svelte`'s design — it is right, it is just starved. Do the levels in the
order a learner reaches them (3, then 4, then 5), and treat a level as done only when a scripted
pass over the **shipped JSON** reports `0 words without an example`, so "1,270 sentences shipped"
can never again be reported as this gap closing. Until 安慰 opens with a sentence in it, this app
returns strictly less than Pleco returns for the same word — and Pleco returns four.
