# Verdict — level-select, loop 3

**PASS: no.** Loop 2's biggest gap is genuinely closed and verified. But the row that replaced it
ships broken text on exactly the cards a returning learner uses: the app's typography gets *worse*
the more you use it, and one of the three things this app teaches — pinyin — is being cut
mid-syllable. Three majors survive.

## Blind design judge — we won, again, by a large margin

Ours was **A** (`progress/shots/loop-3/level-select-mobile.png`); the reference was **B**
(`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`). The judge picked **A**, gap size
**large**: *"A is designed; B is assembled from platform defaults."* Its `whatWeakerMustChange`
list is addressed to Du Chinese, not to us — nine items telling it to put hanzi on a Chinese-app
screen, build a type scale, cut to one accent hue. **There is no deficit to import from it, and
none is manufactured below.**

Two things to carry forward, though. First, the judge named the basis of the win precisely:
*"Chinese is given genuine presence… each level card shows three sample words with hanzi sitting
above tone-coloured pinyin and a small grey gloss, so the language is the artwork rather than
decoration."* Finding 1 is the erosion of exactly that. Second, the judge's own criticisms of A
land on our findings independently and unprompted: *"the 0% progress rail reads as a divider"*
(= finding 4), *"~560px-tall cards mean barely 1.3 levels fit the viewport, which hurts comparison
across five levels"* (= finding 3). It also raised one thing the critic did not: *"the tone-colour
scheme scatters four saturated hues across a single pinyin line and undercuts an otherwise strict
palette."*

## Surviving findings

### Major

**1. The learner's own words render worse than the hand-picked ones — pinyin truncates mid-syllable.**
`progress/shots/loop-3/level-select-progress-desktop.png` at 1440x900, with 42 practised L1 words
and 7 L3 seeded: HSK 1's own weakest word renders **`大学生 / dàxuéshē… / university st…`**. HSK 3
shows `behind som…` and `have no cho…`. Three of six weak glosses overflow (22/22/43px at 1440;
9/9/30px at 375). `LevelCard.svelte:195` puts `truncate` on `<Pinyin>` and `:201` on the gloss.
Systematic, not seed luck: **972 of 4,308 shipped glosses (22.6%) exceed 16 characters** — verified
against `src/lib/data/hsk{1..5}.json`; longest is 34. The static three never truncate because
`preview.ts` hand-picked them short and says so in its own comment (*"kept to a gloss short enough
to sit on one line"*). Pleco truncates list-row definitions (`pleco-iphone-01.png`) but **never the
pinyin** — 手迹 [-跡] shǒujì is always whole. Counter-intuitive detail for the next builder: measured
off the shots, the desktop card is **295 CSS px wide against the phone's 343**, so each preview
column is ~81px on desktop vs ~94px on mobile. The three-up grid makes the *large* viewport the
worst case, which is why `dàxuéshēng` survives at 375 and dies at 1440.

**2. The hanzi shrinks 36px → 26px on precisely the cards that have history.**
Measured computed font-size at 375x812 with progress seeded: HSK 1 = 26px, HSK 2 = 36px, HSK 3 =
26px, HSK 4/5 = 36px. Plainly visible in `progress/shots/loop-3/level-select-progress-mobile.png` —
HSK 1's row is smaller than HSK 2's directly below it. `LevelCard.svelte:120-121` steps the *whole
row* down to its longest word, so the one-character 电 renders at 26px because 大学生 shares its
row, and HSK 3's 背后/成熟 are dragged down by 不得不 alone. **213 of 4,308 words are 3+ characters**
(12 are four), so ~14% of random weak rows step down. Card heights stay uniform at 286/287px, so
the shrink buys nothing — `.hskq-glyph` already reserves the tallest step's box.

**3. The first tappable pixel is a third down the phone, and it gets worse once you have progress.**
First card top: 273px of 812 (34%) empty; **344px of 812 (42%) once the progress strip appears** —
the returning learner sees *less* of their own card than a stranger does. At 320x568 it is 273 of
568 (48%): `progress/shots/loop-3/level-select-320-mobile.png` shows masthead plus exactly one card.
Document is 2,054px = 2.5 phone screens for five items (loop 2 measured 1,827 — this grew again).
The largest Chinese on the page is 词汇练习 at 48px; 词汇 is an **HSK 4 word** (`src/lib/data/hsk4.json`),
so the biggest glyphs on screen are ones the target beginner cannot read, while HSK 1's actual
vocabulary sits at 36px and drops to 26px once practised. This has now survived three loops
(loop 1 finding, loop 2 finding 2, here) and the blind judge reached it independently.

### Minor

**4. At 0% the progress track is indistinguishable from a divider rule.**
`level-select-mobile.png`: under "HSK 1 · Start here" sits a 4px full-width grey pill with zero
fill, then "0 of 500 practised" — it reads as a header underline, five times down
`level-select-full-mobile.png`. The blind judge independently called it *"the 0% progress rail
reads as a divider."* Du Chinese's "0/12 chapters read" (`duchinese-iphone-08-ui.png`) paints a
filled green segment even at zero, which is why it reads as a meter.

**5. Nothing on a card encodes difficulty except a number.**
`level-select-desktop.png`: HSK 1–5 are the same surface, border, type weight and outlined button;
only the featured chip differs. A newcomer gets "Greetings, family, everyday verbs" vs "Society,
culture, shades of meaning" and nothing else. Du Chinese tags every item with a coloured difficulty
dot (coral *Newbie*, blue *Upper Intermediate*) so a learner locates themselves without reading.

**6. "IN THIS LEVEL" is a five-times-repeated eyebrow carrying no information.**
Costs a line on every card in the state where the page is longest (`level-select-full-mobile.png`).
The card already says "HSK 1" in 20px semibold and "0 of 500 practised" directly above; the three
words below cannot be from anywhere else. Note the personalised variant, "YOU KEEP MISSING", *is*
load-bearing — this is only about the empty-state label.

**7. Per-level counts contradict the official list on every card; the explanation is 1,700px away.**
Cards print 0 of 770 / 969 / 999 / 1,070 against `reference/hsk/hsk30-official-L{2..5}.json`'s
772/973/1000/1071 (verified). The merge is deliberate and documented in `src/lib/data/sizes.ts`,
but the colophon reconciles only the 4,308/4,316 *total*, and on mobile it sits below the HSK 5
card. A reader who knows HSK 3.0 meets four wrong-looking numbers before the sentence explaining them.

**8. Desktop left rail still ~270–340px of blank in the first-time state.**
`level-select-desktop.png` at 1440x900: rail content ends well above the card grid's bottom, and the
document equals the viewport, so the void is purely the rail's. Loop 2's finding 7 was improved by
moving the colophon in, not closed.

## Biggest gap

**Make the learner's own three words render exactly as well as the hand-picked three, in
`src/lib/components/levels/LevelCard.svelte`.** One root cause produces both majors: the preview row
is `grid-template-columns: repeat(3, minmax(0, 1fr))` with `truncate` on pinyin and gloss plus a
`glyphSize` step-down — a layout built for three short words that were chosen to fit it, now being
fed arbitrary rows from a 4,308-word list where 22.6% of glosses exceed 16 characters.

Concretely: **delete the `glyphSize` step-down** (lines 119–121) and hold every preview row at 36px
hanzi in every state, so no card ever carries smaller Chinese than the untouched card beneath it;
give a 3–4 character word the room it needs with `grid-template-columns: auto auto auto` and
`justify-content: space-between` instead of three rigid thirds. **Never truncate pinyin** — drop
`truncate` from the `<Pinyin>` at line 195; if a syllable string cannot fit at 13px the column
widens or the row wraps, but `dàxuéshē…` must not ship. **Give the gloss a reserved two-line box**
(`line-clamp: 2` inside an always-reserved `min-block-size`) so "have no choice but to" reads in
full and the card height still cannot move. Then, since `weakestIds` already returns six candidates
for three slots, prefer the ones that actually fit before falling back — the weakest word you can
render is worth more than the weakest word you can only ellipse. Verify at **1440 first**, not 375:
the three-up desktop grid gives each card 295px against the phone's 343, so the wide viewport is the
narrow column.
