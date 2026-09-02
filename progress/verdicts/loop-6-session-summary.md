# session-summary — loop 6 verdict

**PASS: no.** One major layout break on the most common phone widths, and the review card
still reprints the reveal the learner just read.

Loop 5's gap is **closed**, verified by driving real 0/10 and 10/10 runs rather than on the
builder's word: `documentElement.scrollWidth` 375 at 375px, `Practise these 10 again` fully
inside the first viewport at `scrollY` 0 (rect 752.8–798), the chip strip self-scrolling to
the active chip (`scrollLeft` 289 at card 8), a ten-chip index on a perfect run, a rail that
reads as ten broken results rather than twenty dashes, and no console errors in any run,
light or dark, 320–1440.

## Surviving findings

### Major

1. **The sticky action row overflows its own column on every phone from 361px to 398px.**
   The `10 more` pill breaks the page's 40px right margin while every other block keeps it.
   Measured live at 361px: column right edge 321, `.actions .btn-quiet` right edge 358.6 —
   37.6px of overflow, leaving the pill 2.4px from the physical screen edge. At 375px it is
   23.6px over (335 vs 358.6); 390px and 393px are over too; flush only at 320px, where the
   `22.5rem` query narrows the padding, and from 399px up. The `?state=summary` preview with
   the shorter `Practise these 3 again` still lands at 350.8 against a 335 column.

   The cause is arithmetic stated in the file's own comment. `SessionSummary.svelte:1396`
   reads *"at 375px the row is 335px"* — the row is **295px**. The gutter is applied twice:
   `.app-shell` (`layout.css:733`) and `.summary` (`SessionSummary.svelte:1032`) each add
   `--spacing-gutter` (20px), so the column is inset 40px a side. nowrap primary (217.7) +
   10px gap + `shrink-0` quiet (90.9) = 318.6 never fits in 295.

   Evidence: `progress/shots/loop-6/session-summary-zero-361-mobile.png` (pill visibly
   touching the screen edge while the card keeps its margin),
   `session-summary-zero-mobile.png`, `session-summary-mobile.png`,
   `session-summary-dark-mobile.png`, `session-summary-solved-open-mobile.png`.

### Minor

2. **The one line the review card adds over the question screen is the line the sticky bar
   erases.** Everything on the card — hanzi, traditional, tone-coloured pinyin, every gloss,
   POS, the single example sentence — is what `QuestionPrompt` already printed in the reveal;
   each word carries exactly one `example` object (`src/lib/data/hsk1.json`), so the sentence
   is by construction the one just read. The only new content is `YOU PICKED "words" 话 huà`,
   a `--text-xs` grey footnote below a hairline at the very bottom of the card
   (`WordCard.svelte:269`). On the first card at 0/10 the index strip pushes the card 74px
   lower than on a 3-miss run and the 52px fade above `.actions` ghosts that line to roughly
   40% opacity. Evidence: `session-summary-zero-mobile.png` (ghosted) vs
   `session-summary-mobile.png` (7/10, no index, fully opaque).

3. **Flat single-stroke characters strand in the hero box.** 一 renders as a lone black bar
   floating in a 124.1px face box with ~57px of blank card above and below it, in a card
   385.4px tall — the same 124.1px box 包 fills completely. Desktop 0/10 shows 三 as three
   unattached rules. Evidence: `session-summary-solved-open-mobile.png`,
   `session-summary-zero-desktop.png`.

4. **The index strip cuts chips through the middle of a character at both edges, with a hard
   cut and no fade, and the previous card's rounded foot surfaces as a stray white band.**
   At `scrollY` 3456 the leftmost chip is sliced to the bare glyph 间 out of 洗手间 at x=0,
   with a ~12px white band between the strip and the 贵 card. Same at HSK 5. Evidence:
   `session-summary-zero-deep-mobile.png`, `session-summary-l5-mid2-mobile.png`.

5. **The entry sheet is headed "1 of 10" with no marker for whether that word was missed,**
   and on `?state=summary` it claims "New · Not practised yet" about the word the card behind
   it has just marked ✕ NOT QUITE. Carried unchanged from loops 4 and 5. A real run reads
   correctly ("Shaky · Answered 4 times · 2 correct"), so the contradiction is confined to the
   seeded preview — but the missing miss marker is wrong in both. Evidence:
   `session-summary-sheet-mobile.png` vs `session-summary-zero-sheet-mobile.png`.

6. **A perfect score produces the longest page in the app.** A real 10/10 run is
   `scrollHeight` 4721 (5.8 screens) of ten full cards; the identical correct words after a
   7/10 run sit inside a closed `<details>` 45px tall. On the perfect screen all ten card
   heads are 44px rows that are 55% empty, since a correct card carries no status marker.
   Evidence: `session-summary-perfect-mobile.png`, `session-summary-perfect-full-mobile.png`,
   `session-summary-foot-mobile.png`, `session-summary-solved-open-mobile.png`.

## Blind design judge

**It preferred ours, by a large margin.** Ours was B; A was Pleco's iPhone entry for 几乎
(`progress/blind/loop-6/session-summary/mapping.json`). The judge called A "a platform default
with data poured into it" and B "a screen someone composed", and its nine-item
`whatWeakerMustChange` list is addressed to Pleco, not to us — palette discipline, headword
presence, spelled-out labels, thumb-sized controls, an 8pt grid, a ground and a container. We
already hold every one of those. Its named praise: one purple reserved for pinyin with
green/red only for correctness; a clean descending stack per card (要 ~100pt → purple yào ~26pt
→ meaning ~15pt semibold → POS ~8pt grey → sentence); the target character as the hero owning
the left column; the rail split into double dashes so the score reads without colour; and the
header greeting in the language being learned.

It levelled two faults at us, and **one of them is a measurement error**: it read the
Entry/Listen pills at "~38pt". `WordCard.svelte:348` sets `min-block-size: var(--spacing-tap)`
(44px) and a pixel scan of `session-summary-zero-deep-mobile.png` at the pill's horizontal
centre gives 89 device px = 44.5 CSS px. No action. Its second, "the orange chī breaks the
purple-means-pinyin rule", is the tone-colour system read as a slip by a viewer who saw one
one-syllable headword — a signal worth carrying to the design-system piece, not a defect here.

So there is no design deficit to manufacture against the reference. The remaining gap is
against this screen's own reason for existing.

## Biggest gap

**Promote `YOU PICKED` from a grey footnote into the card's second act: a two-column contrast
between the word missed and the word chosen, set directly under the headword.**

Today the missed card is a reprint. Hanzi, traditional, tone-coloured pinyin, glosses, POS and
the single authored sentence are all things `QuestionPrompt` showed seconds earlier, and the
one genuinely new fact — which wrong word was chosen — is 12px grey at the bottom, under a
hairline, half-erased by the sticky bar's fade on the very first card at 0/10. Build the
contrast instead: both words side by side, each set the way this app sets a word (hanzi in ink,
tone-coloured pinyin, primary gloss), the missed one marked as the answer and the chosen one as
the pick, sitting between the headword block and the example sentence rather than after it.
Both are already in hand — `picked` is a full `Word` (`SessionSummary.svelte:179`,
`WordCard.svelte:77`). That makes the card answer the only question a missed word raises —
*why did I pick that one* — which is the one thing Pleco's entry structurally cannot answer,
and the only justification for showing a full entry a second time.

Prove it on a real 0/10 run where all ten cards carry a contrast, and on the 7/10 preview where
three do. Handle the no-answer case (`picked === null`) and the healed case (`fixed`), which
today swap the tag to `No answer` / `First time`.

While in that file, fix the arithmetic that finding 1 names: the column is 295px at 375px, not
the 335px the comment at `SessionSummary.svelte:1396` assumes, because the gutter is applied at
both `.app-shell` and `.summary`. Make `Practise these N again` + `10 more` fit inside 295px at
361px and above, and re-measure at 361 / 375 / 390 / 393 / 399 with the `10 more` right edge
landing on the same x as the card's.
