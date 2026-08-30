# loop 5 — session-engine

**FAIL.** Loop 4's named gap did land — a taught word now counts on the home screen and has its
own bucket in browse (`3a6c6e9`, `91c46ea`) — but the defect underneath it is untouched and now
sits on the first screen a new learner sees: **session 1 is ten teach cards and zero questions**,
and the rail counts them as questions. Five of the critic's six findings survived the adversarial
verifier; I re-drove the real `buildSession` + `applyAnswer`/`applySeen` loop myself and reproduced
the headline numbers to the digit.

## Surviving findings

### 1. MAJOR — a "ten-question session" that asks nothing, and says it did

`buildSession(hsk1, 1, null, 10)` returns 10 of 10 `kind === 'introduce'` (my run, seed 7). Driving
60 daily sessions through the real store loop, `introduce` is **30.8% of all 600 cards at 90%, 75%
and 55% accuracy** — identical to three figures, because the count is quota-driven, not
accuracy-driven. The per-session intro sequence is `10, 0, 4, 3, 3, 3, …` and never leaves 3.

On screen: `QuizProgress.svelte:32` emits `<span class="sr-only">Question </span><b>{shown}</b>/<b>{total}</b>`,
and `quiz/[level]/+page.svelte:353` renders it **above** the `{#if !teaching}` guard that removes
the choice grid — so the strip announces "Question 1/10" over a card with no question on it
(`progress/shots/loop-5/session-engine-mobile.png`, `session-engine-s1-card1-mobile.png`).
`+page.svelte:167` promises "Five levels, ten questions a session"
(`session-engine-home-after-mobile.png`); `README.md:3` promises "a ~10-question session".
Fair to the builder: `SessionSummary` already special-cases `firstLook`
(`session-engine-s1-summary-mobile.png` reads "10 new words introduced", not "0 of 10 correct"),
so the overstatement is confined to `QuizProgress` and the home/README copy.

### 2. MAJOR — production is rare, and rarest for the learner who needs it; the cause is structural

My 60-session runs on L1: 90% → 30.8 / 45.7 / **23.5**; 75% → 30.8 / 53.7 / **15.5**; 55% →
30.8 / 61.3 / **7.8** (introduce / recognition / production). "Quizzing in both directions" is
withheld from exactly the learner who is struggling. The critic blamed `cardKindFor`'s miss-reset;
that is wrong and the verifier's correction stands — `PRODUCTION_STREAK` is 1, so a 55% learner
reaches it constantly. The real cause is ineligibility: over 120 daily sessions (1,200 cards) I
count **365 introductions + 362 first-questions = 727 cards, 60.6%**, that can never be production
because `direction.ts:107-109` forces recognition at `answers <= 0`. Only 473 cards in four months
of daily practice review anything older than 48 hours. The production card that does appear is a
good card (`session-engine-production-mobile.png`) — there are just not many of them.

### 3. MAJOR (raised from the verifier, not in the critic's list) — 44% of taught words are answered exactly once, ever

Same 120-session run: 365 words met, **160 answered exactly once**, 3 never answered at all. At 60
sessions the once-only share runs 74/182 at 90% accuracy up to 96/182 at 55%. `wordWeight` drops a
word to `streakDecay^1` on its first correct answer while the intro + debt pipeline hands out six
guaranteed slots a session, so a word answered right once is out-competed permanently. This is the
**opposite** of the critic's refuted finding 5: the model under-reviews correct words far more
severely than it over-reviews recovered ones.

### 4. MINOR — discovery is stuck at 3.08 new words a session, and the docs say otherwise

60 sessions at 75%: 600 cards, **185 distinct words met, 182 answered, 3 taught-but-never-asked**,
185 intro cards = 3.08/session → ~162 daily sessions to finish HSK 1. It is a fixed point, not
noise: `exploreShare = 4`, `capacity = OWED_SESSIONS × 6 = 12`, `owed = 3` ⇒ `brake = 0.75` ⇒
`explore = 3`, and the `debt` quota (`index.ts:279-284`) clears exactly those three, re-creating
`owed = 3`. The brake is throttled by a debt the same session manufactures. Two comments are false
of the shipped code for *every* learner including a perfect one: `weighting.ts:127` ("meets 4 new
words every session no matter how much revision is outstanding") and `index.ts:147` ("A learner who
is keeping up sees the full 40%").

### 5. MINOR — metalinguistic cards have a closed distractor carousel

`SIGNALS['hanzi-to-meaning'].register = 20` (`distractors.ts:107`) outranks every other signal
combined (6+4+4+2 = 16) and L1 ships only 14 metalinguistic glosses. Over 400 draws each: 间, 的,
次, 杯, 本, 吧 each drew **exactly 4 distinct distractors, ever**; control 好 drew 29. Verifier's
correction: it is not all 14 — 别 draws 11, 第 10, 地 6 — so the lock-in is the ~5 measure words
plus ~4 particles. Seen on screen twice in real runs (间 and later 本 against the same three).

### 6. MINOR — home says "practised", browse says "not yet tested", about the same ten records

After one all-teach session: `levelStats` → `{practised: 10, answered: 0}` and
`overallSummary → {practised: 10}`, so `/` reads "10 words practised" and "HSK 1 · 10 of 500
practised" with a filled bar (`session-engine-home-after-mobile.png`), while `/browse/1` reads
"490 New · 10 Shown", "Shown by a teach card, not yet tested", and **no Learning chip at all**
(`session-engine-browse-shown-mobile.png`). Both halves are prescribed by `record.ts:170-180`;
the only defect is the word *practised* in `levels/stats.ts:60` and `LevelCard.svelte:221`. That
belongs to level-select, not to this piece.

### 7. MINOR (latent) — `cardKindFor` reads a raw field it says it doesn't

`direction.ts:108` reads `record?.wordId` directly, contradicting its own docstring ("Reads
`readRecord`, not the raw fields"). A record without `wordId` falls back to `phase('') = 1` and
flips the refresh schedule. Unreachable through the shipped store (`blankWord` always sets it).

## Refuted — do not re-litigate

The critic's "no interval, a recovered word is met in 35% of sessions" is **off by ~50x**. In a
genuinely played store the 12 words missed-then-recovered-3× were drawn 3 times across 40
subsequent sessions (0.6% per word-session); synthetic constructions peak at 7/40, never 40/40.
The *ratio* is real (weight 1.060 vs 0.130, because `accuracy = 1 + 4 × lifetime error rate` never
decays) but both sit far below the draw threshold. The "4.36 of 10 words repeat" symptom is real
and misattributed: it is the debt quota returning the previous session's 3 teach cards at a rate of
1.000 by design, not `restMs`.

## What held up

The verifier's 125 fuzzed sessions across all five levels: zero short sessions, zero duplicate
words in a run, zero cards with other than 4 choices, zero duplicate hanzi in a card, zero
cross-question answer leakage, no word introduced twice in 120 sessions. Degenerate inputs
(`size` NaN/-5/0/3.7/1e6, empty list, wrong level, NaN `now`, rng pinned to 0 and 0.999999) all
return coherent sessions. `buildSession` costs 4.7 ms on L1, 10.8 ms on L5. Loop 4's `require`
side door is gone, as instructed.

## Blind judge

None run for session-engine this loop — `progress/blind/loop-5/` covers app-shell, design-system,
level-select, quiz-card, session-summary, vocab-browse only. Same omission as loop 4.

## Biggest gap

**Ask a new word its first question in the session that introduced it, and stop counting the teach
card as a question.** One change, in `src/lib/session/index.ts` and `QuizProgress.svelte`:

1. When a word is drawn from `fresh`, emit **two** cards for it in the same run — the `introduce`
   card and its own `hanzi-to-meaning` first question, placed at least three cards later in `order`.
   Budget it in *slots*, not words: the pair costs two of the ten cards. Hold the steady state at
   3 new words (6 cards) + 4 review cards, which is exactly today's card economics — 3 intros plus
   3 first-questions plus 4 reviews — so review depth does not regress while session 1 becomes five
   teach cards and five real questions instead of ten and none.
2. With nothing outstanding, the `owed` bucket is empty by construction. **Delete** `OWED_SESSIONS`
   / `MIN_FRESH` and the `brake` (`index.ts:135-165`), the `Math.max(0, owed) >= size ⇒ explore = 0`
   branch (`:163-164`), and the `debt` half-quota (`:277-284`). The 3.08 fixed point, the 3
   taught-but-never-asked words, and the 1.000 teach-card repeat rate all die with them.
3. Number only scored cards: `QuizProgress` must count `isScored(question)` cards, and a teach card
   must read "New word", not "Question 4/10". Then the home strapline (`+page.svelte:167`) and
   `README.md:3` are true as written.

Verify in a real browser on a cleared store, not in vitest: session 1 must contain at least four
cards with choice buttons; `/browse/1` immediately after it must show a non-zero **Learning** chip
rather than 10 Shown / 0 Learning; and the rail must never say "Question n/10" over a card with no
choices. Screenshot all three. Finding 3 (a word answered right once should come back before a
never-met word does) is the next thing worth touching, and only after this is on screen.
