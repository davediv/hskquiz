# Verdict — session-summary, loop 5

**PASS: no.**

Two things are true at once this loop. The blind design judge, shown our summary against a real
Pleco entry screen and told nothing about which was which, **preferred ours by a large margin**
— it called ours "authored" and Pleco "assembled from platform defaults," and every item in its
"what the weaker one must change" list is an instruction to *Pleco*, not to us. On visual craft
this piece has cleared the reference.

But the fix for loop 4's wall shipped a regression that is worse than the wall was. At 0/10 —
the exact score that most needs the screen — the miss index blows the mobile layout viewport out
and the primary action becomes permanently unreachable. A learner who gets every word wrong can
never press "Practise these 10 again." That is a fail on its own, and it sits alongside half of
loop 4's stated gap never landing.

## Surviving findings, by severity

### 1. FAIL — at 0/10 the index blows the viewport and the action bar is unreachable
The `.index`/`.chips` scroller is allowed to report content wider than the phone. `.index`
(`SessionSummary.svelte:1126`) already bleeds with `margin: -0.25rem calc(var(--spacing-gutter)
* -1)`, and `.chips` (`:1152-1157`) stacks a **second** `margin-inline: calc(var(--spacing-gutter)
* -1)` on top of it. Nothing anywhere sets `min-inline-size: 0` or `max-inline-size: 100%`, so
`overflow-x: auto` clips the row visually but does not contain it — Chromium's mobile layout
viewport then expands to fit.

Measured live on a real 0/10 run at 375×812 with touch emulation: `window.innerWidth` 581–639,
`innerHeight` 1259–1384, `documentElement.scrollWidth` 581–639 against a `clientWidth` still at
375, and the sticky bar at `barTop` 1325 inside a real 812px viewport. Cause isolated in the
running page: hiding all but five chips (`.chips` scrollWidth 340) snaps the viewport back to
375×812; restoring all ten (scrollWidth 609) puts it straight back to 581×1259.
`.chips { overflow-x: hidden }` does **not** fix it.

Evidence: `progress/shots/loop-5/session-summary-zero-mobile.png` — no bar at scrollY 0.
`progress/shots/loop-5/session-summary-zero-bottom-mobile.png` — taken at scrollY 4009, which
*is* `scrollHeight - innerHeight`, and still shows card ~8 with no bar and ~500px of document
below the visible edge. The builder's own proof shot
`progress/shots/loop-5/session-summary-wall-index-mobile.png` is a 6-miss case where the chips
fit, so this was never tested at the count where the index has to scroll at all.

### 2. MAJOR — the index's position marker walks to chips you cannot see
Same 0/10 run, three scroll positions: scrollY 0 → `aria-current` chip 0; scrollY 2589 → chip 6;
scrollY 3870 → chip 9. `.chips.scrollLeft` is **0** at all three. Only chips 1–5 are ever
painted. In `session-summary-zero-bottom-mobile.png` the strip still reads 吃饭 呢 儿子 那儿 电视机
while the card on screen is the eighth. `jumpTo()` (`SessionSummary.svelte:542-547`) scrolls the
card list; nothing scrolls the active chip into view when `here` changes
(`:552-559`). Past the fifth word the index answers its own question — "which one am I standing
in" — with a chip that is off-screen.

### 3. MAJOR — half of loop 4's stated gap did not land: reload still destroys the run
Loop 4 asked for two edits. Only the `pushState` one was made. `src/routes/quiz/[level]/+page.svelte`
still calls `void startSession(target, demo)` unconditionally from the mount `$effect` (`:171-183`);
there is no restore path anywhere in the file (`grep` for `restore` returns nothing).
Verified: played a real 10/10 run, confirmed "10 of 10 correct" on screen, then `page.reload()` →
"Question | 1/10 | PICK THE MEANING | 考", a brand-new session
(`progress/shots/loop-5/session-summary-after-reload-mobile.png`). Browser-forward into `/quiz/1`
does the same. This is the third consecutive loop in which one ordinary gesture from the results
screen erases the run; the sheet door was closed and the front door left open.

### 4. MAJOR — a perfect score is the wall the index was built for, and is the one state with no index
`SessionSummary.svelte:530-531` reads `const WALL = 6; const showIndex = !drilling && missed.length
>= WALL` — gated on **miss** count, not card count. A real 10/10 run at 375×812 measures
`document.scrollHeight` 4566 against `innerHeight` 812 (5.6 screens), ten `.card.word` under
"Read them once more", and `.chip` count **0**. The learner with the most cards and the least
reason to hunt gets no overview at all.
Evidence: `progress/shots/loop-5/session-summary-perfect-mobile.png`,
`session-summary-perfect-full-mobile.png`.

### 5. MINOR — at 0/10 the ten-segment result strip collapses into one dashed rule
A wrong result renders as two short dashes; ten consecutive wrongs give ~20 evenly spaced red
dashes with intra-segment gaps equal to inter-segment gaps. You cannot count ten results in it —
only the numeral "0 of 10" carries the count. The "broken, not just red" shape idea is right, but
it only reads while misses are sparse. Compare the legible ten groups in
`progress/shots/loop-5/session-summary-mobile.png` (7/10) with
`session-summary-zero-mobile.png`.

### 6. MINOR — starting the drill guillotines the score line on the app bar's edge
Tapping "Practise these 3 again" leaves `scrollY` 116; the app bar is opaque to y=78, so
"7 of 10 correct" is sliced in half across the bar's bottom edge. The app chose that offset
itself. `progress/shots/loop-5/session-summary-drill-mobile.png`.

### 7. MINOR — all three loop-4 sheet minors unchanged, one self-contradicting in a single frame
`progress/shots/loop-5/session-summary-sheet-mobile.png`, opened from a card headed
"✕ NOT QUITE": the sheet is titled "1 of 10" with no miss marker (loop-4 #7); its status line
reads "New — Not practised yet" about the word the learner just got wrong (loop-4 #5); and
"WORDS WITH 要" is cut after 1.5 rows by a full-width black "Practise HSK 1" pill that discards
the results being stood on (loop-4 #6).

## What did close, and is not re-charged
Verified in the running app: the sheet is now a history entry and the back gesture no longer
destroys the run (`/` → `/quiz/1?state=summary` → scrollY 900 → open Entry → `goBack()`: URL
unchanged, dialog count 0, ten cards intact, scrollY still 900 —
`session-summary-sheet-back-mobile.png`). The drill headword is 119.6px against the review card's
119.4px, up from 82.5px in loop 4 — loop 1's instruction, finally landed. Desktop is no longer
loop-3 #8: `.card.word` is a real two-column 138.6/499.4px grid, 696px wide, ten cards in
scrollHeight 1452 (`session-summary-perfect-desktop.png`). No console or page errors in any run.

## Blind design judge
Ours was **B**; the reference (Pleco 几乎 entry, `pleco-iphone-02.png`) was A. The judge chose
**B — ours — with gap size "large"**, unprompted and unaware of authorship. It credited the
headword's ~108pt presence and clean four-step supporting scale, the disciplined warm off-white
ground with one violet accent and green/red reserved for semantics, and a real spacing unit with
a 45pt sticky primary action. Its nine "must change" items are all aimed at Pleco. No design
deficit to manufacture here.

The judge did name four finishing errors on our screen, and they are worth carrying as free
work — none rise to the level of the findings above: the blue `yǒu` in the YOU PICKED row breaks
our own violet-for-pinyin rule; the back chevron and the 36pt Entry/Listen pills are under 44pt;
the card is misaligned 3pt inside its section header and footer; and the ghosted second card
bleeds behind the floating footer without a scrim edge.

## Biggest gap

**Make the miss index cost the page zero horizontal width, so the sticky action bar survives a
bad run — and while inside that element, make the marker follow the reader.**

In `src/lib/components/summary/SessionSummary.svelte`:

1. Let `.index` own the edge bleed alone. Delete the second `margin-inline: calc(var(--spacing-gutter)
   * -1)` from `.chips` (`:1156`) — it is stacked on top of the bleed `.index` already applies at
   `:1126`, and two nested negative margins are what push content past the initial containing block.
2. Contain the scroller: `min-inline-size: 0` and `max-inline-size: 100%` on `.index` and `.chips`,
   and `min-inline-size: 0` on every flex/grid ancestor between them and the page column. A flex or
   grid item defaults to `min-width: auto`, which is why `overflow-x: auto` clips the row visually
   while still sizing the page to its content.
3. In the `$effect` that maintains `here` (`:552-559`), when `here` changes, call
   `scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })` on the
   `aria-current` chip — guarded so it does not fight `jumpTo`'s own smooth scroll of the card list.

Prove it with a real 0/10 run at 375×812 with touch emulation — not the 6-miss case that already
fits. Required after the fix: `document.documentElement.scrollWidth === 375`,
`window.innerWidth === 375`, `window.innerHeight === 812`, "Practise these 10 again" visible in
the **first** viewport at scrollY 0, and `.chips.scrollLeft > 0` with the active chip on screen
once you have scrolled to the eighth card. Today all five of those fail
(`session-summary-zero-mobile.png`, `session-summary-zero-bottom-mobile.png`).
