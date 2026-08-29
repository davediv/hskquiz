# Verdict — session-engine (loop 1)

**PASS: no.**

The engine's machinery is better than its critics gave it credit for. I could not break the
distractor picker on shipped data, hostile progress records do not throw, weighted sampling is a
correct Efraimidis–Spirakis A-Res, and every number in `weighting.ts`'s docstring reproduces. Two of
the five reported findings are refuted outright and a third has the wrong mechanism.

What survives is one decision: **direction is chosen by a word's rank inside the session rather than
by the word's own record**, and that single line decides what a first-time learner meets on
question 2 of their first session. Everything below I re-measured myself against the real
`src/lib/data/hsk1.json`, 200 sessions per figure, seeded `mulberry32`.

## Blind design judge

None ran — session-engine is a scheduler, not a screen, and `progress/blind/loop-1/` holds no entry
for it. The screenshots below come from the critic's live run.

## Surviving findings, ranked

### 1. MAJOR — a word's direction depends on who else got drawn, not on the word
`assignDirections` (`src/lib/session/index.ts:75`) sorts the ten picked words by `familiarity` and
gives recognition to the first `ceil(n/2)`. Familiarity is cohort-separated by construction (fresh
`-1`, shaky `0.25`, mastered `7`), so the rank rule degenerates into "whichever cohort is at the
bottom of this particular draw gets recognition". Measured production (`meaning-to-hanzi`) share:

| learner state | fresh | shaky (seen 4 / correct 1) | mastered (streak 3) |
| --- | --- | --- | --- |
| empty progress — first ever session | **50.0%** (1000/2000) | — | — |
| 5 shaky + 35 mastered + fresh pool | 0% (0/800) | **79.6%** (780/980) | 100% (220/220) |
| whole level seen, 5 shaky | — | **0%** (0/890) | 90% (1000/1110) |

Three consequences, all real:

- **A first session is 50% cold production.** `session-engine-production-mobile.png` is question 2
  of a fresh HSK 5 run: "PICK THE CHARACTER / flood" over 雨水 / 码头 / 风度 / 水灾, score already
  0 correct 1 wrong. `session-engine-answered-mobile.png` shows question 1 of a fresh HSK 1 run was
  production too. The module's own docstring promises the opposite — "every brand-new word is
  *introduced* rather than tested cold" — and `session.spec.ts:152` asserts it only after seeding
  120 words of history, so the all-fresh case is unguarded by the suite that claims to cover it.
  `applyAnswer` then writes `lastMissed` for a word the app never taught, seeding the scheduler with
  miss data it manufactured. There *is* a teach surface (the post-answer reveal in
  `QuestionPrompt.svelte`, and the "Show pinyin" scaffold visible in both shots), so this is
  test-then-teach, not no-teach — but Pleco flips a card before you rate it and Du Chinese shows the
  word in a sentence first. This one tests first.
- **The learner's shaky words land in production 80% of the time** in the ordinary mid-progress
  state, because the four explore-quota words are genuinely the least familiar and soak up four of
  the five recognition slots.
- **A word is never asked both ways.** README promises "quizzing in both directions"; per word that
  is never true while the cohort mix holds — mastered words were 220/220 production, fresh words
  0/800. `SessionOptions` exposes only `rng` and `now`, so no caller can influence it.

Refuted, and not counted here: the "inverted model" framing. Recognition does go to the
least-familiar cohort exactly as documented; the mastered cohort gets 0% of it. The bug is that rank
is the wrong key, not that the ordering is backwards.

### 2. MAJOR — nothing ever stops drilling a word the learner cannot learn
Seeded 60 studied HSK 1 words, three of them never answered correctly, then ran 60 real sessions at
one-day spacing answering everything else at 80%: the three leeches appeared in **19, 22 and 21 of
60 sessions** and took **10.3% of all 600 questions**, while the hardest ordinary word appeared 8
times and the median word once. There is no suspension, no lapse ceiling, no cooldown; Anki suspends
at 8 lapses.

The reported mechanism is wrong and the fix has to be built on the right one: weight does **not**
rise with lapse count — error rate saturates at 1.0 on the first miss, so `missed 1/1` and
`missed 20/20` two days ago both return exactly **22.628** — and the product **is** bounded, at
5 × 1 × 5 × 1 × 3 = **75.000** for a maximal record. A 60-lapse leech is arithmetically
indistinguishable from a word missed once, which is precisely why it never falls out of the queue.
Drilling misses is the spec ("weighted toward past misses"); never letting one go is not.

### 3. MINOR — two answers in one session can normalise to the same sense
`isAmbiguousWith` guards ambiguity *within* a card and `answerIds` stops an answer appearing as
another card's distractor, but nothing compares the ten answers to each other. Across 2,000 L1
sessions: 38 contained a colliding answer pair, and 8 (0.4%) had both halves in `meaning-to-hanzi`,
where the learner reads two near-identical English prompts with different "correct" characters —
"the middle / in the middle"→中间 beside "within / middle"→中; "inside / in"→里 beside "the inside /
in there"→里边; "how many / a few"→几 beside "few / less"→少; "correct / right"→对 beside
"suggestion particle / right?"→吧.

### 4. MINOR — a degenerate `size` produces a dead end instead of an error
`buildSession(words, 1, null, NaN)` and `(…, -5)` both return zero questions, which
`src/routes/quiz/[level]/+page.svelte` renders as the "HSK n has no questions to build from" empty
state. `Math.floor(NaN)` survives the `Math.max(0, Math.min(…))` clamp untouched.

### 5. MINOR — a non-finite weight breaks sampling in a position-dependent way
`wordWeight` returns `NaN` for a record with non-finite `seen`, and `sampleWeighted`'s
`Math.max(weightOf(item), Number.MIN_VALUE)` floor does not catch it, so the sort key is `NaN` and
V8 leaves it unordered. Measured over 500 draws of 5 from 20: the `NaN` item at index 0 was picked
**500/500**; at index 7 or 19, **0/500**. Both violate `rng.ts`'s stated contract that "no word is
ever permanently unreachable". Defence-in-depth only today — `progress-core.ts`'s `decode()`
sanitises non-finite fields — but `wordWeight` is exported and state objects are mutated in place.

## Refuted, weighed out

- **"EXPLORE_SHARE ignores the backlog / no way to ask for review-only."** The 40/60 quota is
  documented in `weighting.ts` in the exact terms of the complaint, and a caller already gets a
  review-only run by passing only already-seen words — `splitQuota` backfills to a full session. A
  product preference, not a defect.
- **"Register notes leak metadata."** 8 glosses out of 4,307 (0.2%), and "wife, informal" is what
  Pleco shows. The 正 gloss/POS contradiction in `session-engine-answered-mobile.png` is real and
  worse than reported, but it is a data-layer defect and is already the *biggest gap* of
  `progress/verdicts/loop-1-vocab-data.md` ("正 (Adv, L1) = in the middle of doing"). Not charged
  twice.
- **"buildSession does not dedupe by id."** Did not reproduce at the claimed rate — 0 of 50 sessions
  repeated a word when the input list carried duplicate ids, and no caller passes one.

## Biggest gap

**Decide direction from the word's own `WordProgress`, not from its rank in the draw — and make a
word's first exposure teach instead of score.** In `src/lib/session/index.ts`, delete
`assignDirections`'s familiarity sort and the `ceil(n/2)` split, and map each picked word
independently:

- `seen === 0` → a new `'introduce'` card: hanzi + tone-marked pinyin + full gloss + POS shown
  together, one "Got it" confirm, no choices, and — critically — `applyAnswer` must not write
  `correct`, `streak` or `lastMissed` for it, only `seen` and `lastSeen`, so the scheduler stops
  manufacturing misses about words it never taught;
- `seen > 0 && streak < 2` → `'hanzi-to-meaning'`;
- `streak >= 2` → `'meaning-to-hanzi'`, and every third or fourth appearance of a mastered word
  back to `'hanzi-to-meaning'`, so "quizzing in both directions" is true of a word and not merely of
  a session.

This needs `'introduce'` added to the `Direction` union in `src/lib/types.ts`, which the file header
says is the orchestrator's to change — report it, do not edit it unilaterally. `QuestionPrompt.svelte`
already renders the whole teach block for the answered state; the introduce card is that block
shown before any tap, and `promptLabel` gains a third case.

Verify with the three measurements above, on real `hsk1.json`, 200 seeded sessions each: an empty
`ProgressState` must yield **zero** scored production questions (today: 1000 of 2000); the 5-shaky /
35-mastered learner must put shaky words in production **under 25%** (today: 79.6%); and no cohort
may sit at 100% of one direction (today: mastered 220/220). Add the all-fresh case to
`session.spec.ts` next to the existing "introduces new words as recognition" test, which passes only
because it seeds 120 words of history first.
