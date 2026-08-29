# loop 2 — session-engine — FAIL

The loop-1 gap was half closed. `src/lib/session/` now decides the direction ladder correctly and
its 101 server tests are green; **nothing outside that directory reads the decision**, so the
running app is still the loop-1 app. Every finding the critic raised was reproduced by the
independent verifier. None was refuted. The verifier also found the prescribed fix is itself
wrong, which changes what the next builder should do.

## Surviving findings, ranked

**1. FAIL — the introduce card exists in the library and not in the product.**
`src/routes/quiz/[level]/+page.svelte:47` imports only `{ buildSession, isCorrect, seededRng }`;
`choose()` at line 154 runs `progress.recordAnswer(question.word.id, isCorrect(question, choice))`
with no gate, and `QuestionPrompt.svelte` has no `introduce` branch — it always draws four
ChoiceButtons. `grep -rn "isIntroduction\|isScored\|cardKind\|kindIsScored"` over `src/`, minus
`src/lib/session/`, returns zero hits (I re-ran it with the verifier's widened alternation; still
zero). Engine measured: 2000/2000 questions across 200 fresh sessions at L1–L5 come back
`kind:'introduce'`, `isScored() === false` — and each still ships four choices, which the route
scores. `progress/shots/loop-2/session-engine-mobile.png` is Q1/10 "PICK THE MEANING / 有些" on a
clean profile; `session-engine-summary-mobile.png` then tells that brand-new learner
"3 of 10 correct" and "7 words to review". `session.spec.ts:223` asserts `isScored` is false; no
test asserts a caller honours it.

**2. MAJOR (found by the verifier, missed by the critic) — the wiring target is broken, so the
prescribed fix trades one fabricated signal for another.** `isScored`'s own doc
(`src/lib/session/index.ts:256`) says the record "should gain `seen` and `lastSeen` and nothing
else" — but `weighting.ts:125` computes `errorRate = (seen - correct) / seen` and `leechBrake`
takes `seen - correct` as the lapse count. I measured, at 1 day since last touch: introduced-only
(seen 1 / correct 0) = **5.714**, truly unseen = **1.000**, answered-right-once = **0.514**. An
introduction makes a word 5.7× more urgent than never showing it, and it never washes out
(intro + 10 perfect = 0.064 vs 0.047 clean). It leaks past the quiz too: `statusOf()` returns
**'shaky'** ("Missed last time") for that record, and `levelStats()` over it returns
`practised:1, answered:1, correct:0, accuracy:0, shaky:1` — the home screen and the browse chips
report the phantom miss as well.

**3. MAJOR — fabricated misses compound through the scheduler.** Shipped-route simulation over 200
learners × 12 sessions on real `hsk1.json`: **7.6 fabricated misses in session 1** (0.00 when the
unscored contract is honoured). Chronic-miss saturation on a 40-of-500 learner, 200 seeded
sessions: the five missed words appear in ~98% of sessions, ~34× a mastered word and ~114× an
unseen one, all five together in 194/200. *Strike the critic's "57.1% of session-12 questions are
re-drills of never-taught words" — the verifier measured 0.0% under both behaviours; the figure is
definition-sensitive and should not be quoted. The mechanism holds.*

**4. MAJOR — production questions have been over-corrected out of existence.** `cardKindFor`
promotes at `streak >= 2`; `wordWeight` multiplies by `0.45^streak` and floors `rest` at 0.2, so
the records that qualify are the records the sampler has retired. Shaky = 14.314,
production-eligible = 0.231, unseen = 1.000 (61.9× and 4.3×). On a deliberately 50/50 pool,
production landed at 0.2–0.6% of questions across two seeds; longitudinally the mix converges to
~4.0 introduce / 5.8 recognition / **0.1–0.3 production** per 10 and stays flat to session 40 —
with the scoring bug fixed. `REFRESH_EVERY` compounds it: `(seen + phase) % 3 === 0` bounces even
a qualifying word back to recognition, so eligibility is only ~2/3 productive. README's "quizzing
in both directions" is not true of the shipped app.

**5. MAJOR — "Show pinyin" prints the answer on a production card.** The `.hint-row` in
`QuestionPrompt.svelte` sits inside `{#if !answered}` with no reference to `question.direction`.
`progress/shots/loop-2/session-engine-hint-mobile.png`: prompt "PICK THE CHARACTER / day of the
month in speech", hint renders `hào`, choices 月 / 本 / 号 / 日. The verifier quantified it — the
answer's pinyin uniquely names one button on 99.5% (L1), 99.9% (L3) and 100% (L5) of production
cards. Small blast radius only because finding 4 keeps production near zero.

**6. MINOR — near-synonym distractors.** `isAmbiguousWith` intersects normalised gloss strings, so
没关系 ["it doesn't matter"] ships alongside 没事儿 ["it's all right","no problem"] and is marked
wrong — `progress/shots/loop-2/session-engine-production-mobile.png`. Same for 记住 / 记得. The
mechanical audit is otherwise clean (0 duplicate choices, 0 short cards, 0 shared senses over
3,000+ real sessions); this is only what a string compare cannot see.

**7. MINOR — session 2 is 60% immediate repeat, deterministically.** 200 simulated learners:
session 2 ∩ session 1 = **6.00/10, min 6 max 6, zero spread**; 46 distinct words met after 10
sessions. `splitQuota` fixes the review quota at 6 and `rest` deliberately does not hold back a
just-missed word. *Restate the critic's session-3 figure: 4.41, not 3.75.*

**8. MINOR / latent.** `cardKindFor({seen:1, correct:0, streak:99})` returns `'meaning-to-hanzi'` —
`counted()` sanitises field types but never cross-checks `streak` against `correct`, in a module
that advertises hardened input. And a level of 1–3 usable words yields 1–3 choice cards that the
route scores at a 100% guess rate; unreachable on shipped levels, but unstated as an invariant.

**Worth recording before anyone rewrites this:** `buildSession`'s input hardening is genuinely
sound. NaN/negative/Infinity/zero `size`, records with garbage or missing fields, a null record, a
bare string record, a key/`wordId` mismatch — all degrade to `introduce` at weight 1.0 and still
return ten well-formed questions. The defects here are design and wiring, not robustness.

## Blind judge
None. session-engine is a logic piece; `progress/blind/loop-2/` holds pairs only for app-shell,
design-system, level-select, session-summary and vocab-browse.

## Biggest gap

**Give the record an exposure counter that is not an answer, then ship the introduce card on top
of it.** The critic's instruction ("gate `recordAnswer`, add `noteSeen`") is right in shape and
wrong in target: `seen` currently *means* "answers", so a `noteSeen` that bumps `seen` alone makes
an introduced word read as a 100%-error-rate word — weight 5.714 vs 1.000 unseen, `statusOf`
'shaky', `levelStats` accuracy 0 (all measured). Do it in this order:

1. **Schema.** Add `exposures: number` to `WordProgress` (`src/lib/types.ts`), default it in
   `blankWord`, bump `SCHEMA_VERSION`/`STORAGE_KEY` and handle it in `decode`/`mergeProgress`
   (`src/lib/progress/progress-core.ts`), and add `progress.noteSeen(wordId)` that bumps
   `exposures` + `lastSeen` and nothing else. `seen`/`correct` stay "answers".
2. **Every consumer reads answers, not exposures.** `weighting.ts:125` `errorRate` and the
   `leechBrake(seen - correct)` call, `statusOf` (`src/lib/components/browse/status.ts`) and
   `levelStats`/`overallSummary` (`src/lib/components/levels/stats.ts`) must all treat an
   exposure-only record as "met, never answered" — not as a miss. Add a test for exactly that
   record asserting weight ≈ 1.0 (never above unseen) and status ≠ 'shaky'.
3. **Wire the route.** In `src/routes/quiz/[level]/+page.svelte`: `if (isScored(question))
   progress.recordAnswer(...) else progress.noteSeen(...)`; when `isIntroduction(question)` hide
   the `.answers` grid and render the reveal QuestionPrompt already draws (hanzi + tone-marked
   pinyin + every gloss + POS) with one "Got it" in the `.action` row; exclude introductions from
   `marks()`, `tally()` and the summary's "words to review". While in QuestionPrompt, drop the
   `.hint-row` when `question.direction === 'meaning-to-hanzi'` — it prints the answer.
4. **Verify in the running app, not vitest.** A clean profile playing `/quiz/1` must end on a
   summary that says neither "N of 10 correct" nor "N words to review" for words it never taught,
   and localStorage after that run must hold ten records with `lastMissed === 0` and `correct`
   consistent with what was actually answered. Screenshot it.

Only then reconcile the ladder with the scheduler — `cardKindFor` promoting at `streak >= 2` while
`0.45^streak` retires the same record is why production is 0.2% of questions and README's "both
directions" is currently false.
