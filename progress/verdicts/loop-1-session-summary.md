# Verdict — session-summary (loop 1)

**Pass: no.** The blind judge put this screen *ahead* of the reference, but every finding
below survived verification against the source and the shots, and four of them are things a
shipped app would not do.

## Blind judge result

`progress/blind/loop-1/session-summary/mapping.json`: **A = reference**
(`reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png`), **B = ours**
(`progress/shots/loop-1/session-summary-mobile.png`).

The judge chose **B — ours — by a moderate margin**, and its `whatWeakerMustChange` list is
addressed to Du Chinese, not to us. Said plainly: on hierarchy, colour discipline and system
consistency an unbiased eye preferred our screen to the reference. There is no deficit to
manufacture there, and nothing in that nine-item list should be actioned.

The judge's one instruction to us is in its `WHERE A WINS` paragraph: *"Character presence:
难忘 at ~95px is a genuine hero, roughly 1.7x B's… B should steal that — its own characters
sit at a polite ~60px and never appear in context."* That is the same defect the critic ranked
first, found independently. Two passes converging on one measurement is the strongest signal
in this report.

## Surviving findings

### Major

1. **The missed word is set 42% smaller than the quiz just set it.** `headwordSize()` in
   `src/lib/components/quiz/quiz.ts` gives a 1–2 char word `hero` = `clamp(4.5rem, 22vw, 9rem)`
   → 82.5px at 375px. `reviewSize()` in `src/lib/components/summary/SessionSummary.svelte`
   gives the same word `lg` = `--text-hanzi-lg: 3rem` = 48px. Side by side:
   `progress/shots/loop-1/quiz-card-mobile.png` (喝 fills a third of the screen) vs
   `session-summary-mobile.png` and `session-summary-real-mobile.png` (干, 早 at roughly half
   that). The component's own doc-comment claims "hanzi at the size the design system reserves
   for a headword" — it is two full steps below it. The testing moment is bigger than the
   teaching moment.

2. **A perfect run delivers no study material, and its own copy promises the opposite.**
   `session-summary-perfect-fold-mobile.png`: "All 10 right. The set is below — a clean run is
   the best moment to read them once more" resolves to the collapsed solved list — hanzi-sm
   (26px), 14px grey pinyin, one right-aligned gloss, no POS, no context. The largest Chinese
   on that screen is the decorative 满分 mark at hanzi-md (36px). The congratulation outsizes
   every word being learned.

3. **Every review card is inert.** `session-summary-zero-full-mobile.png` is 750×5100 —
   2,550 CSS px, ~3.1 phone screens — of ten `<li class="card word">` with no anchor, button or
   audio control anywhere in the list. The only controls on the screen are "Practise 10 more"
   (a fresh weighted session, not these words) and "Levels". The paired reference
   (`duchinese-iphone-05-ui.png`) puts Dictionary / Pinyin / hint on the card itself plus a
   grading row; every Pleco row in `pleco-iphone-01.png` pushes into the headword.

4. **The glosses are raw CC-CEDICT piles, which our own reference rules out as shippable copy —
   and they are the largest English on the card.** Verified in the data:
   `src/lib/data/hsk1.json` has `{"hanzi":"吃","meanings":["to eat","to eradicate"]}`,
   `{"hanzi":"那儿","meanings":["there, colloquial"]}` (a register label as the word's only
   meaning), `{"hanzi":"干什么","meanings":["what are you doing?","what's he up to?"]}` — all
   three read straight off `session-summary-desktop.png`, `-zero-mobile.png` and
   `-zero-full-mobile.png`. `reference/README.md:57`: "Reference material for writing
   learner-facing meanings, **not** shippable copy."

### Minor

5. **Orphaned leading middot in "You picked".** Cropped from
   `session-summary-zero-full-mobile.png` (y 2280–2900): the 干什么 card breaks as
   `× YOU PICKED 是不是 shì bu shì` / `· is it or not?`. `.picked { display: flex; flex-wrap:
   wrap }` makes the ` · {primaryGloss(...)}` text node its own wrappable flex item.

6. **`tabular` applied to a whole prose sentence.** `session-summary-real-mobile.png` renders
   "10 of 500 HSK 1 words practised" with a visible gap either side of the lone "1".
   `.arc-line` carries `class="tabular"`; only the `<strong>` figure needs it.

7. **The arc — "the one figure that outlives the session" — is invisible in the only state the
   app exposes for review.** `seedDemoAnswers` never calls `progress.recordAnswer`, so
   `levelSummary()` returns `seen = 0` and `{#if arc && arc.seen > 0}` never mounts:
   `session-summary-mobile.png` (`?state=summary`) has no arc block at all. Driving a real run
   produces it (`session-summary-real-mobile.png`). Every screenshot review of this screen has
   been reviewing a version missing its most important line.

8. **Arc meter and score rail are stacked bars on incompatible scales.**
   `session-summary-real-mobile.png`: a full-width 10-segment rail directly above a 2%-filled
   4px meter for 10-of-500. The second reads as failed to render. Nothing labels the change of
   scale.

9. **Solved rows break formation on longer words.** `session-summary-perfect-fold-mobile.png`:
   前/那儿/干/明白 are clean two-column rows, then 干什么 pushes its gloss onto a second line,
   right-aligned and orphaned — the `.solved-gloss { margin-inline-start: auto }` fallback
   firing, reading as an accident next to four tidy rows.

10. **`?state=summary` supports exactly one outcome.** `summary.ts` hard-codes
    `DEMO_MISSES = [2, 5, 8]`; the perfect and zero screens required patching source twice. A
    `&misses=0` / `&misses=10` knob would make the two most failure-prone states reviewable
    and diffable.

11. **Traditional forms are in the data and dropped from the one screen whose job is teaching
    the word.** `hsk1.json` carries `"traditional":"乾"` for 干, `"飛"` for 飞, `"過"` for 过 —
    all three appear as review cards in the shots — and `SessionSummary.svelte` never reads the
    field. Pleco prints it inline beside every headword (`pleco-iphone-01.png`).

## Biggest gap

**Make the missed word the biggest thing on the screen, and make that card the only way this
screen shows a word.** In `SessionSummary.svelte`, delete `reviewSize()` and call
`headwordSize()` from `$lib/components/quiz/quiz` — the same function the prompt uses — so a
missed 干 comes back at `hero` (82.5px at 375px) instead of `lg` (48px) and the card the
learner studies is set at least as large as the question they just failed; then drop the
满分/继续/加油 mark from `hanzi-md` to `hanzi-sm` so no congratulation ever outsizes a word
being taught; then render the solved words with that same card component instead of the 26px
grey `.solved-list`, so "the set is below" on a perfect run is true. One card, one size, used
everywhere a word appears here. This is the only thing the blind judge said we should take
from the reference, and it is the difference between a receipt and the back of a flashcard.
