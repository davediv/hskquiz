# loop 3 — session-engine — FAIL

**The loop-2 gap is closed.** The introduce card is in the product, not just the library:
`/quiz/1` on a clean profile opens on a NEW WORD reveal — hanzi, tone-coloured pinyin, every
gloss, POS, one "Got it", no choices (`progress/shots/loop-3/session-engine-firstlook-mobile.png`,
`session-engine-mobile.png`). Ten teach cards later localStorage holds ten records of
`[0,0,0,<ts>,0]` — **zero fabricated misses**, the exact thing loop 2 failed on. The summary says
"10 new words · These were shown, not tested — nothing here counts against you" instead of "3 of
10 correct". Production cards render (`session-engine-production-card-mobile.png`) and no longer
leak the answer through "Show pinyin". The weighting is measurably right: chronically-missed words
draw 31× a mastered word and 113× an unseen one while unseen words still surface at exactly 4.00
per session; 0 duplicate words in 400 sessions, 0 distractors sharing the answer's hanzi or any of
its senses across 4,000 cards, 84.3% POS-matched distractors against a 22.9% random baseline. 308
node/client tests pass. `readRecord`, `wordWeight` and `cardKindFor` are total against null, bare
strings, NaN, Infinity, 1e308 and `streak:99 / correct:0`. Robustness is not the problem here.

It fails because the engine now knows something the rest of the app cannot read, and because a
button in the summary names ten words the engine will not give it.

## Surviving findings, ranked

**1. MAJOR — an exposure is legible only inside `src/lib/session/`.** `readRecord` returns
`exposures`, `met` and `taughtOnly` (`src/lib/session/record.ts:60-113`) and *nothing outside that
directory imports any of them* — `grep -rln "taughtOnly\|exposures" src/` returns five files, all
of them `src/lib/session/*`. Every screen still equates "met" with "answered" by reading
`record.seen` raw: `accumulate` early-returns on `record.seen === 0`
(`src/lib/progress/progress.svelte.ts:814`), `levelStats`/`overallSummary` gate on
`record.seen > 0` (`src/lib/components/levels/stats.ts:53,104`), `statusOf` returns `'new'` on
`record.seen <= 0` (`src/lib/components/browse/status.ts:49`), `progressLine` returns "Not
practised yet" (`status.ts:124`). So one tap after a summary that says "10 new words", `/`
renders "0 words practised · just now" and "HSK 1 · Continue · 0 of 500 practised"
(`session-engine-home-after-mobile.png`) and `/browse/1` renders "500 All / 500 New" with every
taught word labelled "Not practised yet" (`session-engine-browse-after-mobile.png`). Reproduced by
the verifier twice, once against the real `ProgressStore`: `levelStats(state,1)` =
`{practised:0, mastered:0, answered:0, accuracy:null}`, `statusCounts` = `{all:500, new:500}`,
`store.levelSummary(1)` = `{seen:0, answers:0}`.

Two corrections to the critic that narrow it without rescuing it. (a) "record.ts is the only
module that knows an exposure exists" is false — `progress-core.ts:304 applySeen` writes it and
`hasHistory` (`progress-core.ts:179`) is explicitly `record.seen > 0 || record.lastSeen > 0`. What
is true is that **no reader on any screen** knows. (b) "the lie flipped direction" overstates: "0
words practised" is literally true of a word shown and not answered, and the summary says as much
in the same breath. **The one outright false statement is the arc**, `SessionSummary.svelte:366`
"of 500 words met" with a legend reading "met once" (`:375`) — it counts answers, while `met` is a
defined term in this codebase (`record.ts:78`: answered *or* exposed). The verifier measured "9 of
500 words met" after 11 distinct words had been shown, matching the critic exactly. Scope: for 9
of the 10 words the blind window lasts one session, because `splitQuota`'s debt quota pays them
off next run. It is still the first thing a first-time learner sees after their first session.

**2. MAJOR (found by the verifier, missed by the critic) — "Practise these 10" cannot deliver the
ten words it names.** After a first-look session `SessionSummary.svelte:181` sets
`nextLabel = 'Practise these ${taught.length}'` and renders it as the primary at `:516`, wired to
`onRestart` → `src/routes/quiz/[level]/+page.svelte:232 restart()` → `startSession(level, false)`
→ a plain `buildSession(words, target, progress)`. There is no path from that button to the set it
names. Because `splitQuota` is deterministic (verified across 25 independent seeds, zero
variance), tapping it always drills **9 of the 10 and introduces an eleventh brand-new word
instead of the tenth**. Same arithmetic as finding 3, but pointed at a literal UI promise, which
makes it a defect rather than a defensible scheduling choice.

**3. MINOR — session 2 is nine tenths of session 1, deterministically.** S1 taught 地图 上 早 大学
不客气 做 请假 电 非常 今天; S2 asked nine of them plus one new word
(`session-engine-s2q1-mobile.png`). Verifier: 9/10 overlap in 25 of 25 seeds, zero spread.
`splitQuota` (`src/lib/session/index.ts:120`): exploreShare 4, capacity 12, brake 0.1667,
explore = max(MIN_FRESH 1, round(0.667)) = 1, so review takes 9 every time. Defensible as
teach-then-test on its own; not defensible under the button in finding 2.

**4. MINOR — the leech brake never releases, and inverts the brief for relearned words.**
`readRecord.misses` is `answers - correct`, monotonic with no decay, and `leechBrake` divides on
it forever. Real `wordWeight` at 30 days stale with 3 correct in a row: missed-10-then-relearned =
**0.1929**, never-missed = **0.2734**. The word the learner found hardest is drawn 0.71× as often
as one they never got wrong — the opposite of the README's "weighted toward past misses", and
`weighting.ts` does not acknowledge this direction. The curve is also a cliff, not a ramp:
0 misses 0.2744, 5 → 0.9606, 6 → 1.0063, 7 → 0.4740 (a 2.12× drop across `leechLapses`).

**5. MINOR — near-synonyms ship as wrong answers.** 没事儿 "it's all right" with 没关系 on the
card and the mirror; 温暖 "warm" with 暖和 "nice and warm"; 带领 "to lead the way" with 带动.
`distractors.ts:isAmbiguousWith` compares normalised gloss strings, same-hanzi and
character-nesting only, and its own doc (`:171`) names 没关系/没事儿 as out of reach. **Correct
the critic's framing:** "production is 15% of questions so it lands" conflates two rates. Measured
collision rate for these pairs is 4 in 5,500 cards — **0.07%**. Minor is right; "it lands" is not.

**6. MINOR (verifier) — `senses.ts` normalises five things and not hyphens, and the build gate
inherits the hole.** `normalise` (`src/lib/data/senses.ts:184`) keeps `-` in its character class,
so `senseSet('快速') = ['high-speed','rapid']` and `senseSet('高速') = ['high speed','expressway']`
do not intersect. Confirmed against real data: `hsk3.json` ships 高速 `["high speed","expressway"]`
and 快速 `["high-speed","rapid"]`. Both can sit on one card — prompt "high-speed · rapid" with
"high speed" on screen as a wrong answer. `scripts/build-vocab.mjs` imports the same module for
its "no two shipped words share a sense" gate, so that guarantee is defeated by punctuation.
Exactly one such pair across all five levels; a one-line fix, for a case the module's own doc
would call in scope.

**7. MINOR — production is thin for lightly-met words.** 15.2% of cards meaning-to-hanzi (loop 2:
0.2%, so `PRODUCTION_STREAK=1` fixed most of it); 13 of 60 sessions with no production card; 64 of
182 words ever asked were ever produced. Mechanism is real — `cardKindFor` promotes at streak ≥ 1
while `wordWeight` multiplies by `0.45^streak`. **Correct the headline:** "two thirds of words are
never produced" is dominated by the tail, since a word asked once *cannot* be produced. Among
words asked 3+ times, 86% are produced, and production is 21.2% of *scored questions* across all
five levels. "Both directions" is true of nearly every word actually being drilled.

**8. LATENT (verifier).** `takeDistinct`'s held list is flushed unconditionally
(`session/index.ts:158-166`) with no re-check, and `isAmbiguousWith` returns true for
`candidate.id === answer.id`, so an identity collision lands in `held` and gets pushed in —
demonstrated on a duplicated 12-entry list producing a session that asks four words twice.
Unreachable via `loadLevel` (all 500 L1 ids unique), so a guard gap, not a live bug. Separately,
`session/index.ts:363` returns `'dropped'` when the writer has no `noteSeen` and the doc calls that
"a repeat"; driven for real it is an **infinite teach loop** — five consecutive sessions produced
50 cards, all dropped, zero records written. Not reachable through the shipped store, but it is
the shape a learner with unusable localStorage gets, and the comment understates it by an order of
magnitude.

## Refuted — do not carry forward

**The leech brake does not retire words.** The critic's "the five words a learner cannot get right
stop being shown entirely, twice in sessions 26–60" does not replicate. Over 200 real L1 sessions
those five accumulate 11, 12, 12, 13 and 15 appearances against a hardest ordinary word at 14 and
a median at 3 — they are the joint-most-shown words in the run, and they keep appearing after the
brake bites (50 in sessions 1–50, then 4, 2, 2). On a 60-session rerun the critic's "twice" came
out 13, i.e. 6.5× their figure, so it is seed noise, not a property of the engine. And they are
not invisible: streak 0 puts them under `/browse/{level}`'s Shaky chip, "Missed last time", with a
count. What is left is a copy gap already captured by finding 4, not retirement.

## Blind judge
None. session-engine is a logic piece — `progress/blind/loop-3/` holds pairs only for app-shell,
design-system, level-select, quiz-card, session-summary and vocab-browse.

## Biggest gap

**Make a taught word visible to every screen that counts words — and make the summary's own
"Practise these N" actually practise those N.** Both are the same hole: the session's taught set
exists only inside `src/lib/session/`. Close it in this order.

1. **Give the exposure a field of its own.** Add `exposures: number` to `WordProgress`
   (`src/lib/types.ts:59`) — `readRecord` already reads it — default it in `blankWord`, carry it
   through `decode`/`mergeProgress` (`src/lib/progress/progress-core.ts`), and have `noteSeen`
   (`progress.svelte.ts:290` → `applySeen` at `progress-core.ts:304`) bump it alongside
   `lastSeen`. Keep `seen`/`correct` meaning *answers*. Do not bump `seen` — that is the loop-2
   mistake, and `readRecord`'s unstamped-miss repair at `record.ts:130` exists to undo it.

2. **Change the four readers that still equate met with answered.** `accumulate`
   (`progress.svelte.ts:814`): drop the `record.seen === 0` early return so an exposure-only
   record counts into `seen` while contributing nothing to `answers`/`correct`.
   `levelStats`/`overallSummary` (`stats.ts:53,104`): count a taught word as `practised`, leave
   `answered`/`accuracy`/`shaky` on answers alone — an exposure is not a miss and must never make
   a word shaky. `statusOf` (`status.ts:49`): give exposure-only records their own bucket —
   `'seen'`, chip "Shown", `progressLine` "Shown, not yet tested" — instead of collapsing them
   into `'new'`; add it to `StatusCounts` and the chip row so the browse total still reconciles.
   Fix the arc's legend at `SessionSummary.svelte:366,375` last: once `accumulate` counts
   exposures, "words met" / "met once" becomes true instead of off-by-the-taught-set.

3. **Wire the button to the set it names.** Give `buildSession` a way to be handed a required word
   list (or add a `retest(level, wordIds)` path) and have `restart()`
   (`src/routes/quiz/[level]/+page.svelte:232`) pass the ten ids the summary just displayed when
   `firstLook` is true. If you would rather not add that path, change the label — but a primary
   that says "Practise these 10" and delivers nine of them plus a stranger is a defect either way.

4. **Verify in the browser, not vitest.** One clean HSK 1 session: the summary says "10 new
   words", then `/` must not say "0 words practised", `/browse/1` must not say "500 New", and the
   arc must not say "0 of 500 words met". Then tap "Practise these 10" and confirm all ten
   questions are the ten words just taught. Screenshot all three.

Only after that is the scheduler worth touching: finding 4's never-releasing leech divisor is the
next-largest correctness problem, and it is currently drawing a relearned hard word *less* often
than one the learner never missed.
