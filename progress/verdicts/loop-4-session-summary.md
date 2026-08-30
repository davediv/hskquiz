# Verdict — session-summary, loop 4

**PASS: no.** Loop 3's gap is closed on paper — the `Entry` chip now opens `WordSheet` as a
dialog over the results (`SessionSummary.svelte:690-716`), exactly as instructed, and the sheet
is genuinely the richer destination. But the trap did not close, it moved: the sheet is not a
history entry, so the phone's own back gesture still destroys the run. That is the second loop
running in which one ordinary gesture from the results screen unrecoverably erases the session.
Two other structural gaps are verbatim repeats from loop 3 (desktop, headword size).

## Surviving findings, by severity

### 1. MAJOR — the back gesture still destroys the session (loop-3 #1, relocated)
The chip no longer navigates, but nothing in `src/lib/components/summary/`, `WordSheet.svelte`
or the quiz route touches history — `grep -rn "pushState|popstate|beforeNavigate|onNavigate"`
over the piece returns nothing. Escape closes the sheet, the grip drags to dismiss
(`WordSheet.svelte:255-291`), and the one dismissal a phone user actually reaches for is the one
that unloads `/quiz/[level]`. Root cause confirmed in source: the route's mount `$effect` calls
`buildSession(...)` unconditionally (`src/routes/quiz/[level]/+page.svelte:150-170`), so *any*
departure and return builds a brand-new run.
Evidence: `progress/shots/loop-4/session-summary-sheet-back-mobile.png` — drove `/` →
`/quiz/1?state=summary` → open sheet (`[role=dialog]` count 1) → `page.goBack()`; landed on the
level-select screen, summary and every drill result gone.

### 2. MAJOR — the drill shows the character smaller than anything else (loop-1 instruction, 3rd relocation)
Measured live at 375×812: review card `要` 119.38px → drill `.face .hanzi-display` 82.5px →
quiz prompt 152.27px. The one screen that actually re-tests the learner renders the character at
54% of the question that beat them. `ReviewDrill.svelte:23-24` argues the shrink protects a
667px phone, but `headwordSize()` is a fixed step, so an 812px phone pays it too — measured
scrollHeight there was 953 with `.go` at y=743. Room existed.
Evidence: `progress/shots/loop-4/session-summary-drill-mobile.png`. Loop 2 measured 77%, loop 3
69%, loop 4 69% — on a different element each time.

### 3. MAJOR — at a bad score the summary is a 6.5-screen wall with no overview
A real 0/10 run produces ten near-identical full-bleed cards: `document.scrollHeight` 5247
against `innerHeight` 812, ten `.card.word` totalling 4661px, first card top 251.2, and a 73px
sticky bar covering the foot of all 6.5 screens. No compact list, no index, no position marker.
The app's own `/browse/[level]` already ships a dense row; the summary has one density and it is
the maximum. Evidence: `progress/shots/loop-4/session-summary-zero-mobile.png`.

### 4. MAJOR — desktop is loop-3 #8 verbatim, unchanged
1440×900: `.summary` 504px at x=468, `.card.word` 464px, `gridTemplateColumns` computes to the
literal `'464px'`. Confirmed in source — `SessionSummary.svelte:870` is
`grid-template-columns: minmax(0, 1fr)` and the file carries no width media query at all (only
`max-width: 22.5rem`, `prefers-contrast`, `hover`). The hanzi leaves 313px — 67% of the card —
empty; three cards make scrollHeight 1880 in a 900px viewport with the sticky bar cutting card
two. Evidence: `progress/shots/loop-4/session-summary-desktop.png`.

### 5. MINOR — the `?state=summary` preview contradicts itself
`demoProgress()` is fed to `buildSession` but never written to the store, so the sheet's status
line reads "New — Not practised yet" for a word whose card is headed "✕ NOT QUITE". Production is
correct; the URL every screenshot and every review uses is the one that lies.
Evidence: `progress/shots/loop-4/session-summary-entry-bottom-mobile.png` vs
`progress/shots/loop-4/session-summary-realrun-entry-bottom-mobile.png` ("Shaky | Answered 4
times · 2 correct").

### 6. MINOR — the sheet's loudest control discards the results you are standing on
On first paint the "WORDS WITH 要" family — the sheet's whole reason to exist over the card — is
cut after 1.5 rows by a full-width black "Practise HSK 1" pill (`.scroller` scrollHeight 828 vs
clientHeight 489). `SessionSummary.svelte:389-410` intercepts that pill to mean *restart at this
level*. Evidence: `progress/shots/loop-4/session-summary-entry-mobile.png`.

### 7. MINOR — the sheet forgets why it was opened
Headed "1 of 10", ← → walking all ten words of the run, opened from a card stamped NOT QUITE,
with no miss/right marker anywhere above the fold — while the screen that sent you there said
"3 words to review". `SessionSummary.svelte:327` builds `sheetWords` from missed + got +
introduced. Evidence: same screenshot.

### 8. MINOR — not this piece's file: word lists short of the official counts
`src/lib/data/hsk{1..5}.json` = 500 / 770 / 969 / 999 / 1070 against
`reference/hsk/hsk30-official-L{1..5}.json` = 500 / 772 / 973 / 1000 / 1071 (counted directly).
Level-select prints "0 of 770 practised" for HSK 2. Belongs to vocab-data; noted, not charged.

## Blind design judge

**It preferred ours, by a large margin.** `mapping.json` (odd parity) confirms **B = ours**
(`progress/shots/loop-4/session-summary-mobile.png`), A = the reference
(`reference/screenshots/pleco/pleco-iphone-02.png`). Verbatim: *"B is a composed screen; A is a
competent utility wearing system defaults."* It credited six typographic rungs, weight used as a
second axis inside a single line, the ~110pt headword as "unambiguously the subject of the
screen", a two-hue-plus-state-pair budget on a warm off-white ground, a consistent 20pt left
margin on an 8pt rhythm, and 34–48pt tap targets in a persistent thumb-arc bar. Its entire
`whatWeakerMustChange` list is addressed to Pleco — **do not act on it.**

Take only the four refinements it charged against us directly, none of them a rebuild:
- The top third is loose — header, SESSION COMPLETE, score line and strip are separated by
  large near-equal gaps, so nothing groups.
- The 10-segment strip encodes result by colour alone; no shape or label fallback.
- The Entry/Listen pills outweigh the "NOT QUITE" verdict beside them, inverting the card head.
- The ghosted next card reads through the bottom bar; that ground wants opacity or blur, not a
  gradient wash. (Loop 3's scrim note, still open.)
- It again misread our tone colouring as "a fourth hue whose meaning isn't self-evident" —
  purple `yào` vs blue `yǒu`. Second judge in two loops. The system is correct and still not
  legible from one card.

## Biggest gap

**Make dismissing the sheet, by any means including the phone's back gesture, close the sheet
and nothing else — and make returning to `/quiz/[level]` never silently rebuild the run.**

Two edits, one behaviour:

1. In `SessionSummary.svelte`'s `openSheet()`, push a history entry before setting `sheetAt` —
   SvelteKit's `pushState(page.url.href, { sheet: true })` from `$app/navigation`. Add an
   `onNavigate`/popstate handler that, while `sheetAt !== null`, closes the sheet and swallows
   the navigation. Make `closeSheet()` — and Escape, and the grip drag at
   `WordSheet.svelte:255-291` — call `history.back()` instead of only clearing `sheetAt`, so the
   stack never accumulates a stale entry.
2. Guard the mount effect at `src/routes/quiz/[level]/+page.svelte:150-170`: if a finished
   session for this level is already in hand, restore it rather than calling `buildSession`.
   This is the actual root — the chip was only one of its doors, and until it is closed the next
   affordance added to this screen will open the same cliff a third time.

Verify with the exact drive that fails today: load `/`, then `/quiz/1?state=summary`, tap
`Entry`, press Back. Today that lands on the level-select page with the summary, the review list
and every drill result destroyed
(`progress/shots/loop-4/session-summary-sheet-back-mobile.png`). Afterwards it must land back on
the summary, sheet closed, same scroll position, drill results intact.
