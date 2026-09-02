# session-engine — loop 6 verdict

**FAIL.**

The named gap was three clauses. Two landed and are real. Clause 3 was skipped
entirely: `git show --stat 801d7fb` touches 11 files, all under `src/lib/session/` —
no component, no route, no copy.

What landed, verified: a new word is now taught and asked inside the same run
(`session-engine-teach-mobile.png` teaches 渴 on card 1, `session-engine-ask-mobile.png`
asks it on card 6, `session-engine-card6-mobile.png`), and the brake and debt quota are
gone — driving the real `buildSession` + `applyAnswer`/`applySeen` loop for 120 daily
sessions on HSK 1 at 75% gives **362 words met, 362 answered, zero taught-but-never-asked**.
Loop 5's minor finding 5 (distractor variety) is also fixed and nobody credited it: 间, 的,
次, 杯, 本, 吧, 别, 第, 地 now each draw 13 distinct distractors where six of them drew 4.

Every finding below I reproduced myself against the shipped source and by driving the real
engine. Nothing was refuted.

---

## Surviving findings, ranked

### 1. MAJOR — Discovery never yields to revision. The session budget is a frozen constant.

`freshTarget(size)` reads nothing but `size`: `round(10 × 0.4 / 1.4) = 3`, and `splitQuota`'s
backfill loop never fires while four review words exist. So **every** session, forever, is
3 new words (6 cards) + 4 review cards, no matter how far behind the learner is.

My own 120-day run on HSK 1 at 75% accuracy — set of per-session intro counts after session
60 is exactly `{3}`:

| | measured |
|---|---|
| words met | 362 |
| answered **exactly once, ever** | 136 / 362 (37.6%) |
| not answered in the last 30 days | 198 / 362 (54.7%) |
| median gap between two answers of a word | 10 days (p90 37) |
| reached the app's own mastery bar (streak ≥ 3) | **44**, after 1,200 cards |

Four months of daily practice, and 6 of every 10 cards are about a word first met that same
morning. At 3 new words a session HSK 1 alone takes ~166 sessions to *meet*, never mind learn.
README.md:3 promises "weighted toward past misses"; the weighting is real but it is only ever
allowed to spend 4 cards.

One correction to the critic's write-up: it says this leaves "most met words answered once" —
it is 37–40%, not most. The finding stands; the headline overstated its own evidence.

Fair note on blame: loop 5's verdict *ordered* the frozen 3+4 budget ("Hold the steady state at
3 new words (6 cards) + 4 review cards"). The builder complied literally. The prescription was
wrong; the defect is still in the app.

### 2. MAJOR — A just-taught word's first question can be answered by set-membership alone. (Critic missed this; the verifier found it.)

`buildSession` builds `answerIds = new Set(order.map(d => d.word.id))` (index.ts:394) and passes
it to `pickDistractors` as the exclude set — so no word appearing anywhere in the run can be a
wrong answer anywhere else in the run. Harmless when the introduction and its question lived in
different sessions. Now they don't.

I drove 60 warmed sessions on HSK 1 and inspected every first question:
**182 first-question cards; 182 choices drawn from the just-taught set; 0 of them distractors.**
Exactly one of the four choices is a gloss the learner read four cards ago, and it is the
correct answer every single time. A learner who remembers nothing but the *set* of three
English words just shown scores 100% without knowing which character is which. Session 1 is the
purest case: five glosses taught, five questions, one taught gloss per card.

Look at `session-engine-ask-mobile.png` — "thirsty / female / cold / far". Only "thirsty" was
on screen in the last five cards.

### 3. MAJOR — The first question reuses the identical retrieval cue from the teach card.

Confirmed on screen: `session-engine-teach-mobile.png` prints 渴 / kě / "thirsty" over
我渴了，想喝水。 with its English; `session-engine-ask-mobile.png`, five cards later, prints the
same 我渴了，想喝水。 over the choices. Every shipped word carries exactly one example, so a
pair's two cards necessarily print the same sentence — 900/900 measured. Mean intro→ask gap
~5 cards, about a minute.

One material correction the critic got wrong: on the recognition card the sentence's **English
is deliberately withheld** and the headword is bolded in place, not blanked
(`QuestionPrompt.svelte:322-333`, `clue-en` renders only `{#if production}`). So the card is
not re-showing the translation, and "tests memory of a sentence, not of a word" is not what the
markup does. What survives is still real: the same cue, five cards after the gloss. Finding 2
is what actually makes this near-free.

### 4. MAJOR — Clause 3 of the named gap was not done, and the app's own copy overstates the run.

`marks()` (`src/lib/components/quiz/quiz.ts:61-68`) is still `session.questions.map(...)`, one
mark per **card**; `QuizProgress.svelte:32` is still
`<span class="sr-only">Question </span><b>{shown}</b><span class="of">/{total}</span>` with
`total = marks.length`; the route passes `marks(session)` unfiltered. `git log` on
QuizProgress.svelte ends at loop 3.

So on the teach card in `session-engine-teach-mobile.png` the rail reads **1/10** and a screen
reader hears "Question 1 of 10" over a card with nothing to answer. A first session asks 5
questions; a steady one asks 7. Meanwhile `src/routes/+page.svelte:168` still says "Five levels,
ten questions a session" (`session-engine-home-mine-mobile.png`) and README.md:3 still says
"a ~10-question session" — an overstatement of 3.

Partial credit the critic did not give: the eyebrow on that card does read **NEW WORD**, and the
segmented rail does carry a distinct `taught` mark behind the cursor. A sighted learner is not
badly misled. The numeric counter, the sr-only label and the marketing copy are.

### 5. MINOR — Production is rarest for the learner who most needs it, unchanged by the rewrite.

`direction.ts:105` — `if (facts.answers <= 0) return 'hanzi-to-meaning'` — plus
`directionOf('introduce')`, means 362 introductions + 362 first questions = **724 of 1,200 cards
(60.3%) are locked to recognition by arithmetic, not by sampling.** Meaning-to-hanzi lands at
~22% of scored cards at 90% accuracy and ~13.6% at 55%: production collapses exactly for the
learner who is struggling. (The critic's "14.2%" mixed cards and questions as denominators;
both readings support the finding.) README.md:3's "quizzing in both directions" is thinnest
where it matters most.

### 6. MINOR — The run's shape is fully deterministic at the head and tail.

`layout()` puts every introduction in the head and every first question in the tail, so no teach
card can appear in the last three cards and the opening cards are two-thirds teach cards. On a
clean store the shape is absolute — I got `introduce ×5 | hanzi-to-meaning ×5` again, and it
held for every seed both reviewers tried. "Gameable" overreaches: knowing card 8 is a question
confers no advantage in answering it. It is monotony, not exploitability.

### 7. MINOR — `splitQuota`'s docstring is false for a learner who abandons runs.

It claims taught-only words are "only what a learner leaves behind by walking out mid-run, and
those words simply rejoin the review pool on their own weight." Their own weight is 1.0 × stale,
against 11.62 for a word missed once, competing for 4 review cards out of a 400-word pool. I
drove 150 sessions with one run in five abandoned after 4 cards: **27 words still taught and
never asked at the end.** The verifier's harsher pattern left 39.

### 8. MINOR / not reachable from the shipped route — a non-finite `now` returns a session with nothing to answer.

`buildSession(hsk1, 1, null, 10, { now })` with `NaN`, `0`, `-1` or `Infinity` returns **10
`introduce` cards over 5 words** — each word taught twice, nothing scored. I ran all four.
`kindAfterIntroduction` fabricates `lastSeen: at` and `stamp()` rejects those values, so the
record never reaches the second rung. The quiz route uses the `Date.now()` default, so no
learner can reach it — but loop 5's verifier explicitly certified this property and it is gone.

### 9. MINOR / dead code — `SessionSummary`'s `firstLook` branch is now unreachable.

`firstLook = total === 0 && taught.length > 0` needs a run with zero scored cards, which after
loop 6 requires `size === 1`. The "Practise these N" CTA and the "N new words introduced"
headline can no longer be produced by any real session.

---

## What held up, so the next loop does not re-litigate it

875 fuzzed sessions (5 levels × 25 seeds × sizes 1,2,3,5,7,10,20): zero short sessions, zero
cards with other than 4 choices, zero duplicate choices, zero duplicate hanzi in a card, the
answer always present in its own list, no word twice in a run, every repeated word ordered
introduce-then-question, and the ≥3-card intro→ask gap held on every session of 6+ cards.
Near-exhaustion degrades cleanly. `buildSession` costs 5.0 ms on HSK 1, 12.4 ms on HSK 5. The
route's `acknowledge()` correctly leaves a teach card's answer `null`, so `tally()` and the
summary never miscount an introduction as an answer — the overstatement really is confined to
QuizProgress and the home/README copy.

**Blind judge:** none run for this piece this loop.

---

## Biggest gap

**Make the session budget read the learner's backlog instead of returning the constant 3, so
review comes back before new words do.**

In `src/lib/session/index.ts`, delete `freshTarget(size)` — it reads nothing but `size` and
returns 3 forever — and compute the new-word budget from the learner's own record. Count
`due` = met words whose `wordWeight(record, now)` is at or above the unseen reference of 1.0,
then set `pairs = clamp(round((size / 2) × (1 - due / size)), 0, 3)` and give every card the
pairs don't claim to the weighted review draw. A learner with nothing outstanding still meets
3 new words and gets today's 3+4 run; a learner with 6+ words due meets none that session and
gets 8–10 review cards. Keep the floor at 1 new word while a level still has fresh words, so
discovery never stops dead.

Verify by driving 120 daily sessions at 75% accuracy through the real `buildSession` +
`applyAnswer`/`applySeen` loop on HSK 1 and beating the numbers I measured on today's build:

| | today | required |
|---|---|---|
| answered exactly once, ever | 136 / 362 | **under 40** |
| not answered in 30+ days | 198 / 362 | **under 60** |
| at streak ≥ 3 | 44 | **over 150** |
| median gap between two answers | 10 days | **under 5** |

Two things must not regress while you do it: taught-but-never-asked must stay at 0 for a learner
who finishes every run (it is 0 today — do not trade it back), and the review draw must not
starve the abandonment case in finding 7. Screenshot one steady-state session showing 8 or more
cards with choice buttons.

Findings 2 and 4 are cheap and sit directly on the path — while you are in `buildSession`, stop
excluding the run's *own* just-taught words from each other's distractor lists (`answerIds`,
index.ts:394), and make `marks()`/`QuizProgress` count only `isScored` cards so the rail stops
saying "Question 1/10" over a card with nothing to answer. But the gap above is the one that
decides whether this is a study app.
