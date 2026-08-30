# loop 4 — session-engine

**FAIL.** Loop 3's named biggest gap is still open, and loop 4 spent its commit on a mechanism
that no screen imports. Nothing the critic reported was refuted; the adversarial verifier
reproduced all six against the running code and added four more.

## Surviving findings

### 1. FAIL — a taught word is still invisible to every screen that counts words

After one clean HSK 1 session of ten "Got it" taps, `/` renders "0 words practised" and
"HSK 1 · Continue · 0 of 500 practised" with an empty bar
(`progress/shots/loop-4/session-engine-home-after-mobile.png`), and `/browse/1` renders
"500 All / 500 New" with every taught word on the dashed New pip and "Not practised yet"
(`progress/shots/loop-4/session-engine-browse-after-mobile.png`). Verified in source: `accumulate`
early-returns at `progress.svelte.ts:996` (`if (record.seen === 0) return;`), `levelStats` /
`overallSummary` gate on `record.seen > 0` at `levels/stats.ts:53,104`, `statusOf` returns `'new'`
at `browse/status.ts:49`, `progressLine` says "Not practised yet" at `status.ts:124`.

One nuance the verifier is right about: "not attempted" overstates it. Loop 4 landed exactly one
of the four readers `record.ts:170-180` names — `ProgressSummary.met` (`progress.svelte.ts:176`,
`:995`, clamped `:1011/:1013`), built on `hasHistory = seen > 0 || lastSeen > 0`
(`progress-core.ts:213`). The plumbing is there. It is wired to zero screens. The verifier drove
the real store for 25 sessions: `met: 80` against `practised: 77` — three words the store knows
about that every screen calls New.

### 2. MAJOR — the one screen with access to `met` prints `seen` under the word "met"

`SessionSummary.svelte:672` renders `{arc.seen...} of {arc.total...} words met`. A store carrying
5 answered + 3 taught-only words reports `seen:5, met:8` and the line says "5 of 500 words met"
about eight. `grep -rn "\.met\b" src` confirms no consumer outside `progress.svelte.ts` and
`src/lib/session/*`.

The critic's remedy ("one identifier") is incomplete — the verifier's correction stands. The block
is gated `{#if arc && arc.seen > 0}` at `:668`, outside the `firstLook` branch, so on the first
all-teach session — `met:10, seen:0`, the exact scenario in the headline — the line does not
render at all. Both the identifier and the gate have to change.

### 3. MAJOR — the mechanism the commit is named after has never run

`SessionOptions.require` (`session/index.ts:56-70`) and `taughtWordIds` (`:382`) are dead code:
`grep -rnE "taughtWordIds|require:" src/routes src/lib/components` returns nothing, and
`restart()` at `quiz/[level]/+page.svelte:232` still calls `startSession(level, false)` →
`buildSession(words, target, progress)` with no options object. Session 2 does ask exactly the ten
words session 1 taught (`progress/shots/loop-4/session-engine-s2q1-mobile.png`), in 50 of 50
seeds — but via `splitQuota`'s new `Math.max(0, owed) >= size ⇒ explore = 0` branch at
`index.ts:163-164`, not the named set. The commit subject claims wiring that is not there.

Two latent defects ride on that API, both new surface in this commit:
- `require` **bypasses the guard `takeDistinct` exists to enforce**: `index.ts:312` does
  `const picked: Word[] = [...demanded]` with no `isAmbiguousWith` check among the required words.
  `buildSession(L1, 1, null, 10, { require: ['L1-0066','L1-0069'] })` returns a session with two
  cards whose prompt is the identical hanzi 地, different answers marked correct — precisely what
  `takeDistinct`'s doc comment at `:176-189` says it was written to close.
- `require` **never consults the record**: handed ten never-met ids it returns ten `introduce`
  cards — a "Practise these 10" that teaches ten and asks nothing. The worked example at `:381` is
  safe only because `recordOutcome` already wrote `noteSeen`.

### 4. MINOR (larger than it looks) — `nestsWith` tests prefix only, so suffix-nested glosses escape

`opens(short, long)` at `distractors.ts:173-177` compares from index 0, so it catches 去 "to go"
under 出去 "to go out" but not 半 "half" under 一半 "one half". My own enumeration over the shipped
lists (crude normalisation, so absolute counts differ from the verifier's 249/300): **180
same-level shared-character pairs caught by the prefix test, 296 additional substring-nested pairs
that escape** — the guard misses more than it catches, in the same ratio the verifier measured.
On-card: 1.16% of L1 scored cards, concentrated in meaning→hanzi because
`SIGNALS['meaning-to-hanzi'].share = 3` (`distractors.ts:81`) actively rewards the shared
character. Real boards produced: "half" with 半 and 一半; "newspaper" with 报纸 and 日报; "family"
with 家庭 and 全家. Unlike finding 5 this needs no thesaurus — `opens()` has to test containment.

### 5. MINOR — near-synonym distractors reach the learner

Session 2 card 2 in the browser: prompt 会, choices including "to be able to" — which is 能's gloss
(`hsk1.json` L1-0160 vs L1-0270, both L1 verbs). `isAmbiguousWith` compares normalised gloss
strings and shared characters, so it cannot see the pair; `plausibility()` actively scores them
together. 0.34–0.44% of scored cards depending on the confusable list used.

### 6. MINOR — a metalinguistic gloss is answerable with no Chinese

`progress/shots/loop-4/session-engine-s2q1-mobile.png`: 第 against "it is raining", "half a year",
"please come in" — the answer is the only option describing a grammatical function.
`plausibility()` (`distractors.ts:88-113`) scores gloss word-count and `/^to\s/i` and has no
register signal. The verifier under-cut the critic here: restricted to hanzi→meaning, the only
direction where glosses sit on the buttons, **42.1%** of metalinguistic-gloss cards drew three
ordinary-phrase distractors, and it is not only 第 and 别 — 吗 and 个 too.

### 7. MINOR — a "ten-question session" is a six- or seven-question session, permanently

With 40 of 500 words answered: exactly 4.00 introduce and 6.00 scored cards in every one of 200
sessions, zero variance. A live store at 75% accuracy holds steady at 30.4–30.8% teach cards over
120 sessions. `QuizProgress.svelte:26-36` still announces a teach card as "Question 1/10"
(`progress/shots/loop-4/session-engine-mobile.png`), and `+page.svelte:153` still promises "ten
questions a session".

### 8. MINOR — `recordOutcome`'s documented `dropped` contract has no caller

`index.ts:449-452` instructs the caller to tell the learner their progress is not being saved;
both call sites (`+page.svelte:207`, `:214`) discard the return value. Unreachable with the shipped
store, so latent — but prescribed and unimplemented.

## What held up

The verifier tried and failed to break: 500 randomized states through the real `buildSession`
(no duplicate word, always 10 questions, always 4 choices, exactly one correct, zero violations);
25 real sessions through the real store (zero fabricated misses, zero fabricated answers, no word
re-taught, teach cards wrote only `lastSeen`, all 80 records survived reload byte-for-byte — the
loop-2/loop-3 honesty fix holds end to end); mastery reachable; miss-weighting real (median return
gap 2 sessions after a miss vs 11 after a correct); hostile `size` values all fall back to 10.

## Blind judge

No blind-judge pair was run for session-engine this loop (`progress/blind/loop-4/` covers
app-shell, design-system, level-select, quiz-card, session-summary, vocab-browse).

## Biggest gap

**Stop adding capability to `src/lib/session/` and change the four screen-side readers so an
exposure counts as an exposure.** The plumbing you need already landed this loop —
`hasHistory(record)` at `progress-core.ts:213` and `ProgressSummary.met` at
`progress.svelte.ts:176/995`. Make these four edits and nothing else:

1. `src/lib/components/summary/SessionSummary.svelte` — render `arc.met`, not `arc.seen`, at
   `:672`, **and** change the gate at `:668` from `arc.seen > 0` to `arc.met > 0` so the line
   appears after a first-look session at all. Both, or the headline scenario still shows nothing.
2. `src/lib/components/levels/stats.ts:53` and `:104` — count a word into `practised` when
   `hasHistory(record)`. Leave `answered` / `correct` / `accuracy` / `shaky` on `record.seen`
   alone: an exposure must never make a word shaky and must never dilute accuracy.
3. `src/lib/components/browse/status.ts:49` — give exposure-only records their own bucket instead
   of collapsing them into `'new'`: `if (record.seen <= 0) return record.lastSeen > 0 ? 'seen' : 'new'`.
   Add `'seen'` to `STATUS_FILTERS` / `STATUS_META` with the chip "Shown", and make `progressLine`
   (`:124`) say "Shown, not yet tested". `statusCounts` already derives `new` by subtraction, so
   the chip row still reconciles to 500.
4. `src/lib/session/index.ts` — **delete** `SessionOptions.require` and `taughtWordIds`. They are
   unwired, they bypass `takeDistinct` (two 地 cards in one session), and wiring them as documented
   would produce the teach-only loop the same file warns about. The button already drills the right
   ten via `splitQuota`. Do not leave a documented fix in the tree that no screen imports.

Then verify in the browser, not vitest: one clean HSK 1 session, after which `/` must not say
"0 words practised", `/browse/1` must not say "500 New", and the summary must say "10 of 500 words
met". Screenshot all three. Finding 4 (`opens()` must test containment, not prefix) is the next
thing worth touching — and only after this one is on screen.
