# Verdict — vocab-browse, loop 2

**PASS: no.** Four majors survive. The list screen is genuinely good — a blind judge preferred it
over Pleco by a large margin — but the screen behind it is a leaf, and the filter strip that is the
reason to open the screen still cannot show the number it exists to show.

## Blind design judge

Ours was **A** (`progress/shots/loop-2/vocab-browse-mobile.png`, /browse/1 at 375x812); the reference
was **B** (Pleco iOS, `reference/screenshots/pleco/pleco-iphone-01.png`). The judge picked **A**, gap
size **large**, and it did not know which was which. Say it plainly: on the browse list itself we are
ahead of Pleco, and no deficit is manufactured below to offset that.

> *"A is authored; B is assembled from platform defaults… Someone chose the small-caps abbreviations,
> chose to inset the hairline dividers, chose the warm neutral over white. B shows exactly one design
> decision — per-character tone colour, a legacy dictionary convention — and takes everything else off
> the shelf."*

Its `whatWeakerMustChange` is addressed to Pleco, not to us. But three of its asides about **A** are
ours to keep: our hanzi should be larger for a browse screen, the crimson `Practise` collides with
tone-1 red, and the chips (~28pt) and search field (~36pt) sit under the 44pt touch minimum. Note the
judge's one criticism of B's colour — *"the tone system is applied to the characters while the pinyin
stays bold black, so colour is doing the wrong job on the wrong element"* — is exactly what our sheet
now does (finding 7).

## Surviving findings

### Major

**1. The word sheet is a dead end — no usage, no cross-links — and this is where "open this instead of Pleco" is decided.**
Full sheet text for 安慰 in `progress/shots/loop-2/vocab-browse-sheet-mobile.png`: `1 of 1,070 / 安慰 /
HSK 5 / ān wèi / VERB · ADJECTIVE / 1 to comfort / 2 to console / CHARACTERS / 安 ān 1st tone / 慰 wèi
4th tone / New / Practise HSK 5` — then it stops, 574px of an 812px viewport.
`src/lib/components/browse/WordSheet.svelte` is 699 lines and contains no example sentence and exactly
one link (`href={practiseHref}`, line 338). The CHARACTERS cards are inert `<Hanzi>` renders (line 314)
— 安 does not say what 安 means and goes nowhere. Pleco's 几乎 entry
(`reference/screenshots/pleco/pleco-iphone-02.png`) spends ~70% of the screen on four example
sentences, hanzi + pinyin + English with per-sentence audio, behind CHARS / WORDS / SENTS tabs.

**2. The status chips still cannot show five counts at 375px, and the new fade lands on the one count that matters.**
Measured live on /browse/5: `.chips` clientWidth 375, scrollWidth 513; chip right edges All 102, New
189, Learning 294, Shaky 384, Mastered 493. `Mastered 50` is 118px off-screen; `Shaky`'s count sits
under the 44px `mask-image` fade. `progress/shots/loop-2/vocab-browse-chips-mobile.png` shows the
fourth chip as washed-out grey `Shaky` with **no number at all**. `StatusFilter.svelte`'s own header
comment says the "show me the 14 I keep missing" case *is* the reason to open this screen. The chevron
nudge is a real gain over loop 1 — nothing signalled overflow then — but discoverability was half the
problem; the count is the payload.

**3. Chip counts are derived from stored records without checking the word still exists, so the screen contradicts itself three ways in one frame.**
`src/lib/components/browse/status.ts` — `statusMap()` walks `Object.entries(state.byWord)` and filters
on the `L5-` prefix alone, never against the level's word list; `statusCounts()` then counts that map.
Its comment defends this as costing "tens of entries instead of 1,071 lookups". Seeding ids `L5-0`…
`L5-199` (shipped ids are zero-padded, `L5-0001`) yields
`progress/shots/loop-2/vocab-browse-shaky-mobile.png`: chip filled crimson reading `Shaky 50`, header
reading `0 shaky`, body reading `No shaky words in HSK 5 yet`. Reachable without a corrupt store — ids
are position-derived, so closing the 1,070-vs-1,071 gap (finding 5) renumbers every id after the
insertion point and desyncs every existing learner. Not browse-only (home reports `150 of 1070` under
the same seed), but browse is where it is visible in one screenshot.

**4. The zero-results hint recommends a query that also returns zero, because search is silently level-locked.**
`src/routes/browse/[level]/+page.svelte:382` hardcodes: *"try "hao", or "aihao" for 爱好."* 爱好 is an
HSK 1 word; `searchWords(level, words, query)` (line 118) is scoped to one level's index, so `aihao` on
/browse/5 returns 0 and on /browse/1 returns 1.
`progress/shots/loop-2/vocab-browse-search-empty-mobile.png` is the stuck learner being stranded a
second time by the only copy they read. Related: the placeholder says `hanzi, pinyin or meaning` with no
scope hint, and `hao` on HSK 5 returns 7 words without 好 itself. Pleco's `shouji`
(`reference/screenshots/pleco/pleco-iphone-01.png`) searches the whole dictionary and returns 手机 first.

### Minor

**5. The header prints a word count that disagrees with the standard its own footer cites, without the disclosure the home screen now carries.**
Recounted shipped vs `reference/hsk/hsk30-official-L{n}.json`: 500/500, 770/772, 969/973, 999/1000,
1070/1071 — 4,308 vs 4,316. /browse/5 prints `1,070 words`, the sheet prints `1 of 1,070`, the footer
cites GF 0025-2021 whose L5 count is 1,071, and `reference/README.md` says a level whose count differs
is wrong. Home now discloses this in plain copy (`progress/shots/loop-2/progress-store-phantom-ids-mobile.png`);
browse carries the same numbers with none of the explanation.

**6. 386 of 4,308 rows carry no POS chip, so the gloss column's left edge goes ragged.**
Recounted per level: 76/95/61/78/76. Cross-checked against the reference: it supplies a pos for **0**
of the 386, so the build is faithful and there is nothing to backfill — this is layout, not data. Cost
is visible in `progress/shots/loop-2/vocab-browse-desktop.png` (半年, 帮忙 flush left beside 班, 帮
indented past their chip) and in `vocab-browse-chips-mobile.png`, where 岸上 *"ashore, on the riverbank"*
starts left of 岸 *"N. shore or coast"*. Reserve the chip column or drop the indent.

**7. The sheet tone-colours the headword hanzi; the row one tap away renders the same word in flat ink.**
`WordRow.svelte:55` passes `tones={false}` with a comment stating the rule — *"Tone colour stays on the
pinyin and off the hanzi"* — while `WordSheet.svelte:247` renders the headword and `:314` the CHARACTERS
cards with tones on. `progress/shots/loop-2/vocab-browse-l5-mobile.png` shows 安慰 in black ink; one tap
later `vocab-browse-sheet-mobile.png` shows 安 in tone-1 red and 慰 in tone-4 purple. The loop-1 blind
judge preferred us *because* we confined tone colour to the pinyin; the loop-2 judge criticised Pleco for
the same thing. Pick one rule and state it.

## Biggest gap

**Make the CHARACTERS strip in `src/lib/components/browse/WordSheet.svelte` the way out of the sheet:
turn each character card into a list of the other HSK 1–5 words that contain it, tappable, opening the
sheet for that word.**

This needs no new data. Build an inverted index once at module load over the 4,308 shipped words —
`Map<character, Word[]>`, keyed on the characters of `word.hanzi`, ordered by ascending HSK level then
by the level's own word order — and under each character card render its first ~6 entries as rows in
the same three-tier treatment the list already uses (hanzi, tone-coloured pinyin, gloss), each one
calling the sheet's existing navigation rather than closing and reopening it. Tapping 慰 in 安慰 should
put 慰问 and 欣慰 in front of the learner; tapping 安 should put 安全, 安静, 安排 in front of them, with
their HSK level on each row so a level-5 learner can see which are already behind them. While you are
in that file, give each character its own gloss on the card — 安 *"peaceful"* — so the card stops being
two inert tone labels.

That single change converts the sheet from a leaf into the graph a dictionary actually is, closes the
finding-1 dead end with data we already ship, and gives cross-level reach that finding 4's level-locked
search does not. Example sentences are the bigger prize and the reason Pleco's entry screen wins, but
they need sourcing and an HSK-level gate at build time; do the index first, in this file, this loop.
