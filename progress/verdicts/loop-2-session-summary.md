# Verdict — session-summary (loop 2)

**Pass: no.** The blind judge put this screen ahead of the reference by a *large* margin — the
craft is now genuinely better than Du Chinese's. But the screen still cannot do the one thing
its own heading promises, and that is a product failure no amount of typography settles.

## Blind judge result — we won, plainly

`progress/blind/loop-2/session-summary/mapping.json`: **A = reference**
(`reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png`), **B = ours**
(`progress/shots/loop-2/session-summary-mobile.png`).

The judge chose **B — ours — with `gapSize: "large"`**, up from "moderate" in loop 1. Its words,
about our screen: *"B is the only one of the two that reads as authored"*; five distinct
hierarchy levels separated on four axes at once; *"sets the traditional variant 〔那兒〕 beneath in
lighter grey — an editorial call nobody makes by accident"*; one accent plus two quarantined
semantics against the reference's five-plus hues; a visible 8pt rhythm; thumb-sized targets.

**The eleven-item `whatWeakerMustChange` list is addressed to Du Chinese. Do not action any of
it.** Several items ("if this is meant to be a session summary, it is missing the summary",
"give the ground a colour", "collapse the palette to one accent plus two semantics") describe
things we already do.

The judge's instructions *to us* are the four flaws it named in our screen, and they are all
refinements: the blue on 有的 / yǒu de reads as a second accent doing the purple's job (it is
tone-3, but the judge could not know that); the red 句 on the second card fades to white under
the sticky bar and collides with red-means-wrong; the bar wants more separation from the card it
cuts (`.actions` does carry a 24px gradient scrim and `max(0.875rem, var(--app-safe-bottom))`,
so the judge's "no scrim, no safe-area inset" is factually wrong — but a card sliced mid-stroke
is what a reader sees); the back chevron looks under 44pt.

## Surviving findings

### Major

1. **Nothing on this screen studies the words it names.** Confirmed in source:
   `src/lib/components/summary/WordCard.svelte` contains exactly one interactive element in its
   264 lines — `<SpeakButton>` at line 94. No anchor into `/browse/[level]`, no again/got-it
   grading, no add-to-list. The sticky primary is "Practise 10 more" → `restart()` in
   `src/routes/quiz/[level]/+page.svelte:166` → `startSession(level, false)` → `buildSession`,
   whose `splitQuota` (`src/lib/session/index.ts:99`) takes `size - round(size * EXPLORE_SHARE)`
   with `EXPLORE_SHARE = 0.4` — 6 weighted-review + 4 fresh drawn from the whole seen pool. The
   three words just named are likely but not guaranteed to return, and are diluted when they do.
   `session-summary-mobile.png` says "3 words to review" above three cards that review nothing.
   The paired reference does the opposite: `duchinese-iphone-05-ui.png` puts Dictionary / Pinyin /
   hint on the card plus Forgot / Almost / Got it! under it.

2. **On a perfect run, half the first screen is the score restated six ways, and the largest
   type on it is the negative heading "Nothing to review".**
   `progress/shots/loop-2/session-summary-perfect-mobile.png` (750×1624 = 375×812 CSS): the first
   card's top edge is at **395 CSS px — 48.6% of the viewport**. Above it, in order: SESSION
   COMPLETE, 满分 mǎn fēn full marks, "10 of 10 correct", a ten-segment all-green rail, "Nothing
   to review" (24px bold), "All 10 right. The set is below, at full size…", then a disclosure
   headed "10 answered correctly". Six restatements, three redundant with the rail directly
   above. The 7/10 default (`session-summary-mobile.png`) reaches its first card at 254 CSS px —
   31% — so the *best* outcome buries the vocabulary deepest.

3. **The review card is still 25% smaller than the prompt that just tested the word — the
   loop-1 gap closed in substance, not in its own terms.** `headwordSize()` now returns `hero`
   (`--text-hanzi-hero: clamp(4.5rem, 22vw, 9rem)` = 82.5px at 375px) and `WordCard.svelte:56`
   calls it, so the card really did go 48px → ~82px: measured ink in
   `session-summary-zero-mobile.png`, 天气 spans 321px @2x = ~80 CSS px/char. But
   `session-summary-quizprompt-mobile.png` measures 书包 at 426px @2x = **~107 CSS px/char**,
   because the prompt stopped calling `headwordSize()` and now measures its viewport row.
   `WordCard.svelte`'s own header comment concedes it and argues the case ("ten cards scroll, one
   question does not"). The argument is defensible; the loop-1 instruction — "set at least as
   large as the question they just failed" — is still unmet. Everything else in that instruction
   landed and is visible: hero hanzi, 〔那兒〕 inline, per-syllable tone colour, POS, a Listen
   control, the solved list rendered as the same full-size card
   (`session-summary-perfect-mobile.png`), and 满分/继续/加油 held at ~26px.

### Minor

4. **Error red and tone-1 red are literally the same hex.** `src/routes/layout.css:119,141`:
   `--hq-accent: #c8102e` and `--hq-tone-1: #c8102e`, with `--color-wrong: var(--hq-accent)`;
   dark mode collides identically at `#f2685e`. In `session-summary-zero-mobile.png` the
   "✕ NOT QUITE" label, the 天 headword and every rail segment are one crimson doing three jobs.
   The greens collide less exactly: `--hq-correct #0e7a53` vs `--hq-tone-2 #1f7a3d`.

5. **The level arc spends ~115 CSS px on a bar that cannot show anything.**
   `session-summary-l5-mobile.png`, from a real driven HSK 5 run: "10 of 1,070 words met" =
   0.93%, rendered as a white pill with a single grey dot at its left edge — the same size and
   colour as the "met once" legend dot 30px below. The figure is already written in words
   directly above it. (The `?state=summary` preview still renders no arc at all, because
   `seedDemoAnswers` never calls `progress.recordAnswer`.)

6. **Two-sense glosses are middot-joined at the largest English size on the card, and some are
   not learner copy.** Verified in the shipped data: 男性 → `["the male sex", "a male"]`,
   接连 → `["in a row", "time after time"]`, 包 → `["bag", "to wrap"]` with POS
   "noun · measure word · verb". The loop-1 raw-CEDICT problem is genuinely fixed — 那儿 now
   reads "the spoken word for there" — but "the male sex · a male" is a dictionary artifact
   printed at 18px bold as the answer to a card (`session-summary-l5-mobile.png`).

7. **Every solved card is stamped "✓ CORRECT" inside a disclosure labelled "10 answered
   correctly".** `session-summary-perfect-full-mobile.png` (~3,196 CSS px, ~3.9 screens): ten
   redundant green labels occupy the top line of every card — the line
   `reference/screenshots/pleco/pleco-iphone-01.png` gives to the headword.

## Biggest gap

**Make the primary action drill exactly the words this screen just named, and make each card a
door into its word.** In `SessionSummary.svelte`, when `missed.length > 0` the sticky primary
becomes **"Practise these 3 again"** and hands the missed word ids straight to a session — pass
the missed `Word[]` as `buildSession`'s `words` with `size = missed.length`, so `splitQuota` has
no fresh pool to dilute with and the run is those words and nothing else; demote "Practise 10
more" to the quiet slot and move "Levels" out (the app bar already carries a back control). Then
give `WordCard` a second control beside Listen that opens that word in `/browse/[level]`, so the
card leads somewhere instead of being a printout. Today the only control on a card is Listen and
the only primary is a fresh 6-review + 4-fresh draw — a screen headed "3 words to review"
contains no way to review anything, while Du Chinese's equivalent card offers Dictionary,
Pinyin, hint, Forgot, Almost and Got it. We now beat that screen on every typographic axis a
blind judge can see. This is the axis it cannot see, and it is the one the learner is on.
