# Verdict — session-summary, loop 3

**PASS: no.** Loop 2's gap ("the summary is a printout, not a door") is genuinely closed —
`ReviewDrill` re-tests the missed words in place, the list visibly heals, and loop 2's redundant
copy is gone. But the door that was added opens onto a cliff, and the review card still teaches
nothing the quiz reveal had not already shown.

## Surviving findings, by severity

### 1. FAIL — the "Entry" chip is a one-way trap that destroys the session
`WordCard.svelte:149` is a real navigation:
`href="{resolve('/browse/[level]', …)}?q={entryQuery}"`. Tapping it leaves `/quiz/1`. Pressing
Back returns to `/quiz/1`, whose `$effect` calls `buildSession(...)` on mount
(`src/routes/quiz/[level]/+page.svelte:150-162`) and builds a **brand-new run**. The summary,
the "N words to review" list and every drill result are gone, unrecoverable.
Evidence: `progress/shots/loop-3/session-summary-realrun-mobile.png` (the summary, 0 of 10) →
`-entry-nav-mobile.png` (browse) → `-after-back-mobile.png`, which reads
"1/10 · PICK THE MEANING · 下课". Verified in source: the `href` and the mount effect both exist
as described.

### 2. MAJOR — the door leads somewhere poorer than the card it left
`/browse/1?q=要` is a filtered list — "2 matches", two rows carrying the same four fields at a
third the size. The real entry, `src/lib/components/browse/WordSheet.svelte`, is one further tap
away and already `role="dialog"`, already renders `<ol class="senses">` (1 to want / 2 to need /
3 will), a `CharacterCard` breakdown and a "Words with 要" family (重要 不要 就要 快要 要求 with
level pips). The app already ships the screen the summary should be opening.
Evidence: `-entrylink-mobile.png` vs `-wordsheet-mobile.png`.

### 3. MAJOR — the review card is a dictionary line set large
Hanzi, traditional, pinyin, gloss, POS — exactly the quiz reveal. No example sentence, no
character breakdown; 要's three senses are middot run-on as "to want · to need · will". Both
reference apps put the word *in use* on this same screen: Pleco's 几乎 entry carries four example
sentences with audio; Du Chinese's review card carries a ruby "sentence" section with an English
translation.
Evidence: `-mobile.png`, `-full-mobile.png` against
`reference/screenshots/pleco/pleco-iphone-02.png` and
`reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png`.

### 4. MAJOR — 387 CSS px (47.7% of the fold) before the first word
Measured: crest top 77, score 146.9, `.arc` top 206.8 / **h 114.9**, heading 343.7, first card
**387.0**, innerHeight 812. The single biggest occupant is an arc that cannot show anything: at
40/500 the bar is a ~26px green stub, the grey "met once" fill is entirely covered by the green
mastered fill so its legend dot marks nothing on screen, and "40" is already written in words on
the line directly above. Loop 2 measured 395px; this is 387. The symptom moved, it did not close.
Evidence: `-witharc-mobile.png`, `-perfect-mobile.png`, `-zero-mobile.png`.

### 5. MAJOR — the teaching card is still smaller than the prompt that beat the learner, and the ratio got worse
Summary 要 computes to 82.5px (`--text-hanzi-md`); the `/quiz/1` prompt 出去 computes to 119.37px
(`--text-hanzi-prompt`). 69% — loop 2 was 77%. The loop-1 instruction "set at least as large as
the question they just failed" is still unmet, and regressed.
Evidence: `-after-back-mobile.png` (下课 ~115 CSS px/char) beside `-mobile.png` (要 at 82.5px).

### 6. MINOR — cleared-drill primary contradicts its own screen
`drillTargets = pending.length > 0 ? pending : missed` (`SessionSummary.svelte:197`), so with the
list clear the black primary still reads "Practise these 3 again" under a heading saying
"All 3 words fixed / the list is clear". Evidence: `-fixed-mobile.png`.

### 7. MINOR — "YOU PICKED" prints a mistake the learner did not just make
`WordCard.svelte:190` — `picked === null ? 'No answer' : fixed ? 'First time' : 'You picked'`.
Re-miss with a different distractor and the card still shows the original wrong answer as what
you picked. Evidence: `-healed-mobile.png` (picked "written character", card still reads
YOU PICKED "to have" 有 yǒu).

### 8. MINOR — desktop is the phone column with nothing added
1440×900: a ~640px centred column, one card fills the fold, hanzi hard-left with ~55% of the
card empty, sticky bar cutting card two. Three missed words could sit side by side.
Evidence: `-desktop.png`.

## Blind design judge

**It preferred ours, by a large margin.** `mapping.json` confirms B = ours
(`progress/shots/loop-3/session-summary-mobile.png`), A = the reference
(`reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png`). Verbatim: *"B reads as an
authored system; A reads as a stock flashcard layout dressed up in a marketing collage."* It
credited five cleanly separated type levels, one left axis per card, a three-role colour budget
on a warm ground, and named the dot-separated gloss, the 10-dash strip, "YOU PICKED" and the
black-pill-plus-outline pair as decisions rather than defaults. Its whole
`whatWeakerMustChange` list is addressed to Du Chinese, not to us — **do not act on it.**

Take only the two flaws it charged against us directly:
- The bottom scrim clips "dì fāng" mid-glyph rather than landing in negative space
  (visible in `-mobile.png`). Fix the scrim height or the scroll padding.
- It read our pinyin as "two colours for one role" — purple `yào`, blue `yǒu`. That is
  actually tone colouring, and `-wordsheet-mobile.png` proves the system (bú green / yào purple).
  But a trained judge staring at one screen could not see it, which means the system is not
  legible from a single card. That is worth one legend or one restraint, not a rebuild.

## Biggest gap

**Stop navigating away from the results. Make the card's "Entry" chip open the existing
`WordSheet` as a dialog over the summary instead of linking to `/browse/[level]?q=…`.**

Import `src/lib/components/browse/WordSheet.svelte` into `SessionSummary.svelte`, open it from
the chip with that card's `Word`, and close it back to the same scroll position. Delete the
`href` on line 149 of `WordCard.svelte` — keep the `/browse` link only as the quiet footer link
it already is.

This is one change that closes two findings. It removes the trap (today: click Entry, press
Back, land on "1/10 · 下课" with the summary and every drill result destroyed — verified), and
because the sheet already numbers the senses (1 to want / 2 to need / 3 will), breaks the
characters down, and lists the word's family (重要 不要 就要 快要 要求), it is also the cheapest
way to make the review list finally teach something the quiz reveal did not already show.
