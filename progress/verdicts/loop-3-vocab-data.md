# loop-3 — vocab-data

**Verdict: FAIL.** The corpus is now correct as *data* — coverage, ids, levels, tones and POS
fidelity are clean to the card — but the disambiguation pass that fixed loop 2's collisions did it
by moving cards off their own meaning. Two cards ship a gloss that is wrong, one of them written
this loop, and the loop-2 verdict named the exact failure mode and the pattern was repeated anyway.

Verified independently this loop: `node scripts/build-vocab.mjs` reproduces all five JSON files
byte-identically (`git status --short src/lib/data` empty), `problems: 0`, `problemsByGate: {}`.
4,308 shipped cards from 4,316 reference rows (the 8-row gap is the 8 deliberate same-hanzi
collapses, each of which unions both POS labels and keeps a gloss for both senses — checked).

## Surviving findings

### 1. FAIL — 听见 (L1) still ships only "to catch a sound"; the quiz will grade a right answer wrong

`src/lib/data/hsk1.json` L1-0363 `meanings: ["to catch a sound"]`, authored at
`scripts/overrides/baseline-L1.json:186`, unchanged at HEAD 71261ae. The loop-2 verdict quoted this
exact gloss as the bad pattern (`progress/verdicts/loop-2-vocab-data.md:145`) and so does the
builder's own `scripts/overrides/README.md:68-70`. Ran the app's own splitter
(`src/lib/data/senses.ts`): `senseKeys(听见) = {"catch a sound"}`, `senseKeys(听到) = {"hear"}`,
`senseKeys(听) = {"listen","hear"}` — no intersection on any pair. `isAmbiguousWith`
(`src/lib/session/distractors.ts:198-203`) therefore returns false, so 听到 is an eligible distractor
for 听见: a learner who knows 听见 means "to hear" taps 听到's button and is marked wrong. The
reference gives both words the identical gloss `["to hear"]`, so the collision is real and the
paraphrase only hid it from the guard.

The same paraphrase also deletes the word from the app's own search. `progress/shots/loop-3/vocab-data-hear-mobile.png`:
`/browse/1?q=hear` reads **"4 matches"** — 好听, 听, 听到, 听写 — and 听见 is not among them.

Same swap on 看见 `["to see","to notice"]` vs 看到 `["to catch sight of"]`, which inverts the
reference (CEDICT: 看见 = "to see; to catch sight of", 看到 = "to see").

### 2. FAIL — 衬衣 (L3) ships "underclothes", written THIS loop to dodge a collision with 衬衫

`scripts/overrides/batch-25-or-collisions.json:30-33` → `{"meanings":["underclothes","a shirt worn
next to the skin"],"note":"衬衫 L3-0086 owns \"shirt\"; 衬 is the lining layer"}`, shipped in
`src/lib/data/hsk3.json` L3-0087. `git log --follow` puts batch-25 at f68a4a4 `builder(vocab-data) …
[loop 3]` — new this loop. The reference row's own `cedictDefs` is `["shirt","CL:件[jian4]"]`;
现代汉语词典 defines 衬衣 as 衬衫. `meanings[0]` is the answer-button string, so the button reads
"underclothes". `progress/shots/loop-3/vocab-data-shirt-mobile.png`: `/browse/3?q=shirt` returns 2
rows — 衬衫 N. "shirt" and 衬衣 N. "underclothes, a shirt worn next to the…", truncated at 375px.

Softening, which does not save it: "underclothes" is not pure invention (ABC/Wenlin gives 衬衣
"underwear; shirt"), and "shirt" is still substring-reachable in browse search. The defect is the
primary, and the method — the override README's own forbidden move, made one file after the rule was
written.

### 3. MAJOR — 该 (L2) now leads with "to be one's turn", created this loop

`batch-25-or-collisions.json` L2-0172 → `["to be one's turn","should"]`, note `"应该 L2-0675 owns the
bare obligation"`. Reference `cedictDefs` for L2-0172: `["should","ought to","probably","must be","to
deserve","to owe","to be sb's turn to do sth", …]` — "should" is sense 1, "to be sb's turn" is sense
7. 该 at HSK 2 is the modal. The answer button now reads "to be one's turn". Confirmed the collision
it was dodging is now invisible to the gate: `senseKeys(该) ∩ senseKeys(应该) = ∅`, because 应该 was
simultaneously moved to `["ought to","to be supposed to"]`. Both cards moved off "should"; neither
now owns it. ("should" does survive as `meanings[1]`, so the browse row and the reveal are still
true — the defect is confined to the primary.)

### 4. MAJOR — nothing checks that a card's own English survived the disambiguation

Read from source: `gateProblems()` in `scripts/build-vocab.mjs:751-828` implements exactly five gates
— register, cross-level shared sense, romanization, POS/primary agreement, punctuation balance — plus
`uniquenessProblems()` for same-level primary collisions and duplicate meaning sets. None asks
whether the word's own meaning is still on the card. That is why every finding above ships green.
~204 cards (verifier's independent stemming: 207) whose reference CEDICT entry is short and
unambiguous share no word stem with any shipped gloss; most are harmless synonym rewrites (美丽
"lovely", 逐渐 "little by little") and the gate cannot tell those from 听见 / 可是 / 小朋友 / 全体
because it never asks. (Correction to the critic: 频道 is not in this set — it ships `["a TV
channel"]` from batch-26.)

### 5. MAJOR — ~23 of 4,308 cards (0.5%) carry a wrong-for-level or unusable primary; the count holds, the causal story does not

All 21 ids named reproduce verbatim in the shipped JSON: 输入 L3 `["to import","to input"]`, 各地
`["in all parts of", …]`, 处于 `["to be in"]`, 长处 `["good aspects", …]`, 期中 `["interim", …]`, 权利
`["right"]`, 幽默 [Adj] `["humor", …]`, 频繁 [Adj] `["frequently", …]`, 长寿 [Adj] `["longevity", …]`,
正版 [N] `["genuine", …]`, plus 衬衣, 该, 听见, 看到, 可是 `["yet"]`, 小朋友 `["youngster"]`, 全体
`["everyone as a body"]`, 植物 `["plant life", …]`, 法 `["a way of doing something", …]`.

**Refuted in part:** the headline claim that "the direction has flipped … they were written by the
disambiguation pass itself" is contradicted by its own evidence. 10 of the 19 (输入, 各地, 处于, 长处,
期中, 权利, 幽默, 频繁, 长寿, 正版) have no override at all — they are inherited CC-CEDICT lead senses,
the exact thing the headline says almost none of them are. Only 4 (衬衣, 该, 植物, 法) were written
this loop; 5 are loop-1 baseline carry-overs. The *count* is a floor and grows: four more of the same
POS-lead class were missed — 最近 L2 [N] "recently", 近来 L5 [N] "recently", 原先 L5 [N] "originally",
一般 L2 [Adj] "generally" — pushing 19 toward 23. Down an order of magnitude from loop 1; as a volume
problem, sense selection is essentially solved.

The POS half of this is one line, not an audit: gate (d) at `scripts/build-vocab.mjs:805-815` fires
only on a `to …` lead on an N/Adj/Adv card and a bare-noun lead on a `['V']`-only card. An Adj-only or
N-only card leading with a noun or an *-ly* adverb is in its blind spot — which is every POS case
above. Add the symmetric test.

### 6. MINOR — 386 cards ship an empty `pos` array and break the browse column

Counted: 386 (L1 76, L2 95, L3 61, L4 78, L5 76), faithful to the 386 reference rows with an empty
POS field — the data is right, the rendering is not. `progress/shots/loop-3/vocab-data-hear-mobile.png`
shows 听到 breaking the column that 好听 (ADJ.), 听 (V.) and 听写 (V.) establish;
`progress/shots/loop-3/vocab-data-l5-mobile.png` shows 岸上 flush left between 岸 (N.) and 按摩 (V.).
Filed in both prior verdicts, unchanged.

### 7. MINOR — the two bound forms ship as bare headwords that are not words

Exactly two reference rows carry the ellipsis notation (L3-0318 …极了, L4-0242 …分之…) and both ship
stripped: 极了 `["to an extreme degree"]`, 分之 `["used to say fractions: two thirds"]`, both `pos: []`.
`QuestionPrompt.svelte` sets `--hero-max: clamp(6rem, …)`, so 分之 renders at ~96px on a quiz card —
a string the learner will never meet in text. Unchanged from loop 2's finding 6.

### 8. MINOR — 199 distinct primary glosses are claimed by two or more cards

Computed over all 4,308: 电脑 L1 / 计算机 L2 both "computer"; 饭店 L1 / 饭馆 L2 / 餐馆 L5 all
"restaurant"; 父亲 L3 duplicates 爸爸 L1 "father"; 时间 L1 / 时光 L5 "time"; 常常 L1 / 频繁 L5
"frequently". Quiz-safe — `src/lib/session/index.ts:194` builds the distractor pool from
`words.filter((w) => w.level === level)`, so cross-level twins can never share a card — but the
browse list shows identical English on different words.

## Credit, verified independently

Coverage is clean and nobody had checked it: all 4,316 official ids traceable, 0 ghost ids, 0 wrong
levels, 0 hanzi mismatches once the standard's own 称1/面2 digits and 爸爸|爸 variants are accounted
for, 0 duplicate ids, syllables 1:1 with characters including erhua. Pinyin matches reference on all
4,308 cards, 0 tone errors; variants preserved (谁 shéi/shuí). All 8 row collapses keep both senses,
fixing loop 2's 初 merge bug.

## Biggest gap

**Add a gloss-survival gate to `scripts/build-vocab.mjs`, then re-resolve every card it flags by
QUALIFYING the shared sense instead of replacing it.**

Concretely, as a sixth gate in `gateProblems()`: for each card, take the reference row's `cedictDefs`
senses that are short and unambiguous (≤2 content words, no parenthetical), normalise them through
`src/lib/data/senses.ts`, and fail the build if none of those stems survives anywhere in `meanings`.
It fires on ~204 cards today. Most are benign synonym rewrites you will whitelist by hand in one
pass; the gate exists to isolate the ones that are not — 听见 must contain "hear", 衬衣 "shirt", 该
"should", 可是 "but", 小朋友 "child", 全体 "all", 植物 "plant", 法 "law".

Then fix each of those by keeping the shared word and putting the distinguishing tag in the SAME
gloss, so `senseKeys` still sees the collision and a human eye can resolve it on the button: 听见 "to
hear (and catch it)" vs 听到 "to hear (result of listening)"; 衬衫 "shirt (dress shirt)" vs 衬衣
"shirt (general word)"; 可是 "but (spoken)" vs 但是 "but (written)"; 该 "should (it's one's turn)" vs
应该 "should (ought to)".

A collision resolved by moving BOTH cards off the shared word is not resolved. It is hidden — from
the gate, from the distractor guard, and from the app's own search, which is why `/browse/1?q=hear`
cannot find 听见 today.
