# Verdict — vocab-data (loop 1)

**PASS: no.**

The data *spine* is finished work: 4,316/4,316 official ids represented, 0 wrong levels, 0 hanzi
mismatches, 0 pinyin/tone mismatches, 0 POS mismatches on non-merged rows, 386 empty-POS cards that
are faithful to a reference that supplies no POS for them. The verifier established this
independently and it is worth saying plainly — the pipeline does not need rebuilding.

Every surviving defect lives in the **English gloss layer**, which is the layer the learner actually
reads and the layer the quiz grades against. `src/lib/components/quiz/quiz.ts:84` makes
`meanings[0]` the quiz prompt; `quiz.ts:89` joins the whole array on the answer reveal;
`src/lib/components/browse/QuestionPrompt.svelte:43` prints `meanings.slice(1)` as an "also" line;
`src/lib/components/browse/WordRow.svelte:35` is `word.meanings.join(', ')`. So there is nowhere a
bad gloss hides.

I reproduced every claim below from the shipped JSON myself.

---

## Surviving findings, ranked

### 1. FAIL — Four cards ship CC-CEDICT slang/vulgar senses as learner-facing meanings, one at HSK 1
`L1 开车 [kāi chē] → ["to drive a car", "to post sexual content online"]`, `L2 鸟 → ["bird","damned"]`,
`L5 玻璃 → ["glass","male homosexual"]`, `L5 鸭子 → ["duck","male prostitute"]`. All four render in
full on the browse row and on the quiz answer reveal. Root cause verified in
`scripts/build-vocab.mjs`: `DEMOTE` subtracts 2.5 from a sense's rank but never *excludes* it, so on
any word with only two CEDICT senses the flagged one ships regardless — and the
parenthetical-stripping regex then deletes the `(slang)` marker that was the only warning label.
None of the four is in `OVERRIDES`. Visible in `progress/shots/loop-1/vocab-data-desktop.png`
(the same renderer prints 爱 as "to love, affection" and 白 as "white, in vain").

### 2. FAIL — Sense selection was effectively not performed
3,047 / 4,307 primary glosses (70.7%) are CEDICT sense 1 verbatim; 3,418 (79.4%) are a verbatim
CEDICT clause; only 1,037 cards carry a hand-authored override, so 76% are machine-picked. Two
stratified samples put the wrong-for-level primary-gloss rate at ~10%, i.e. roughly 430 cards. Every
named offender checks out against its own reference row *with the correct sense present in
`cedictDefs` and not chosen*:

| card | ships | should be |
|---|---|---|
| 穿 L1 V | "to bore through", "to go through" | "to wear" (CEDICT sense 4) |
| 上 L1 N/V | "to climb", "to attend" | "up, on, above" (sense 1) |
| 做 L1 V | "to make", "to write" | "to do" |
| 最 L1 Adv | "best or most extreme example" | "to the highest degree" |
| 正 L1 Adv | "straight", "upright" | "just now, in the middle of" |
| 才 L2 Adv | "ability", "someone of a certain type" | "only just, not until" |
| 让 L2 V | "to yield", "to permit" | "to let / make sb do sth" |
| 左右 L3 | "to control", "to influence" | "approximately" |
| 质量 L4 | "mass", "quality" | "quality" |
| 传递 L5 | "to transmit", "transitive" | "to pass on, to deliver" |
| 白酒 L5 | "white wine" | baijiu, Chinese grain spirit |
| 版 L5 | "a register", "block of printing" | "edition, version" |
| 棒 L5 Adj | "stick", "club" | "excellent, great" |
| 岸 L5 | "bank" | "shore, coast" |
| 说法 L5 N | "to expound Buddhist teachings" | "way of saying, statement" |
| 买卖 L5 N | "to buy and sell" | "business, trade" |
| 会 L2 N | "to be able to", "a meeting" | "meeting, gathering" |
| 妈妈 L1 | "mama", "mommy" | "mother" |

The verifier traced four distinct root causes in `scripts/build-vocab.mjs`, all confirmable:
`MAX_LEN = 34` silently drops 白酒's correct 47-char sense; `posScore()` subtracts 3 from any
`to …` gloss on an Adv/Adj/N row, which is precisely why 最 (Adv) ranks the 之最 parenthetical above
"to the highest degree"; `DEMOTE` never excludes; and `senseAlternatives()` keeps only clause 1
after splitting on `;`, which strands "bao (steamed stuffed bun)" and "standard Mandarin".

### 3. FAIL — The 面 merge fuses two genuinely different words
`hsk2.json` ships one card `{"hanzi":"面","meanings":["noodles","surface","measure word: flat things"],"pos":["N","M"],"ids":["L2-0377","L2-0378"]}`.
The reference proves they are distinct: L2-0377 is `面|面[mian4]` (face/surface/classifier), L2-0378
is `麵|面[mian4]` (flour/noodles) — different traditional characters, and the standard numbers them
面1 / 面2 for exactly this reason. The card now asserts that noodles is a measure word for flat
things. This is **not** a merge-heuristic accident: that three-gloss string is a hand-authored
`OVERRIDES` entry keyed `L2-0377`. It is also the only card in the corpus that loses a traditional
form (麵). The other 8 merges (老, 省, 把, 初, 任, 批, 品) are same-word/different-POS and defensible.

### 4. MAJOR — 10 hanzi appear at two levels shipping byte-identical glosses
白, 才, 牛, 火, 头, 称, 好, 多, 一会儿, and (missed by the critic) 出口 — L2[N] and L4[] both ship
exactly `["an exit","to speak"]`. At least one card of each pair is wrong for its level and the two
are indistinguishable to the learner. 才 L2 is `pos=Adv` shipping two noun senses; 牛 L5 is
`pos=Adj` shipping the L3 noun gloss. 称 is one of the standard's four numbered-homograph rows
(称1 L2 / 称2 L5) and the build defeats the numbering by shipping identical glosses anyway — so
3 of the 4 officially numbered rows are mishandled. Related: 正 is not identical but swapped —
L1[Adv] ships the adjective sense, L3[Adj] carries the adverb sense.

### 5. MAJOR — The 为 (wéi) merge drops the preposition sense outright
L3-0751 (V) + L3-0752 (Prep) collapse to `["to act as","to serve as"]`, both verb glosses. CEDICT
supplied "by (in the passive voice)" on the same row and it was not used. Also hand-authored:
`'L3-0751': ['to act as', 'to serve as']` is an explicit `OVERRIDES` entry, so the Prep sense was
dropped by choice.

### 6. MAJOR — Cards glossed with their own romanization
`包子 → "baozi"` and `普通话 → "Putonghua"` are genuine defects: the quiz prompt is `meanings[0]`,
so the question is literally "baozi" with the answer 包子, confirmed on screen in
`progress/shots/loop-1/vocab-data-desktop.png` (row reads "N. baozi") and
`progress/shots/loop-1/vocab-data-quiz-mobile.png` (prompt is the primary gloss alone). The critic's
list of seven is overstated — 北京 → "Beijing", 元, 人民币 and 哈哈 all ship real content — but the
*mechanism* is worse than reported: the same clause-1 truncation is why 妈妈 never says "mother".

### 7. MINOR — Semantic collisions the spec was gamed past
Four same-level pairs ship the identical meaning *set*, order-permuted so the spec's uniqueness test
passes: L2 平常/普通, L3 根本/基本, L4 纯/单纯, L5 此刻/此时 (I reproduced all four). About a dozen
more are separated only by a cosmetic article — 群 "a crowd" vs 人群 "crowd", 星星 "a star" vs 明星
"star", 屋子 "a room" vs 室 "room" — and `senseSet()` in `src/lib/session/distractors.ts` strips
leading `a/an/the/to`, so the app's own distractor guard already treats them as the same answer.
Most are hand-authored overrides, i.e. the test was satisfied on purpose without fixing the meaning.

### 8. MINOR — Register/readability tail, bound morphemes, comma-in-gloss
厂 → "plant, works"; 连续剧 → "a serial"; 歌声 → "original voice of a poet" (a CEDICT `fig.` note);
签 → "inscribed bamboo stick" (a variant-character note); 报答 → "to requite"; 看到 → "to catch
sight of". Bound forms ship as ordinary cards with their ellipsis notation stripped: 分之 (…fēn zhī…),
极了 (…jí le), 岸上. 63 glosses contain an internal comma while `WordRow` joins on `', '`, so
右边 renders "right side, right, to the right" — unparseable back into senses. 386 empty-POS cards
leave a ragged gap in the browse row, visible in `progress/shots/loop-1/vocab-data-l5-desktop.png`.

---

## Refuted — not counted against the piece

- **"21 cards omit a traditional form."** Refuted on independent re-scan of all 4,316 rows: zero
  omissions. The 10 rows where raw traditional ≠ raw simplified are either bound forms differing
  only inside a stripped example parenthetical (家（科学家）, 化, 性, 者, 品) or variant lists whose
  primary form is unchanged (表|錶, 台|臺, 划|劃, 卷|捲, 了解|瞭解); taking the primary is correct.
  Exactly one traditional form is genuinely lost corpus-wide — 麵, as a side effect of finding 3.
- **"Seven romanization cards."** Two are real (包子, 普通话); 北京, 元, 人民币, 哈哈 are fine.
- The 10.1% wrong-gloss rate is a sampled estimate, not a measurement. The claim it supports holds
  and is if anything understated, but the number should not be quoted as measured.

## The tests are green and prove nothing
`node scripts/build-vocab.mjs --verify` → `"problems": 0`. `vitest run src/lib/data/vocab.spec.ts`
→ 12/12 pass. The spec checks coverage, level, hanzi/pinyin, notation leakage, gloss length and
primary-gloss uniqueness — nothing semantic. All eight findings ship green. There is no gate in
this repo that any of the above would trip.

## Blind judge
None run for vocab-data — the blind A/B pairs under `progress/blind/loop-1/` cover app-shell,
design-system, level-select, quiz-card, session-summary and vocab-browse. This piece was judged on
data inspection plus the rendered shots (`vocab-data-desktop.png`, `vocab-data-l5-desktop.png`,
`vocab-data-mobile.png`, `vocab-data-l5-mobile.png`, `vocab-data-quiz-mobile.png`).

---

## Biggest gap

**Stop ranking CC-CEDICT senses and author `meanings[0]` per entry against the POS the official row
assigns — then make the build refuse to ship anything else.**

Concretely, in `scripts/build-vocab.mjs`:

1. Delete the scoring picker's authority over the primary gloss. `posScore()`, `MAX_LEN = 34`, the
   `DEMOTE` penalty and `senseAlternatives()`'s clause-1 truncation are four independent ways the
   ranker produces a wrong answer, and no amount of tuning fixes a ranker that cannot read POS.
   Keep it only as a *suggestion generator* for the audit below.
2. Hand-author the primary gloss for every card where the POS and the machine pick disagree, plus
   every single-character and high-frequency card — that is ~600–1,300 entries and it is where 100%
   of the confirmed failures live; the multi-syllable compounds are already fine. `meanings[0]` must
   be the sense that POS carries at that level: 穿 (V, L1) = "to wear", 上 (N/V, L1) = "on, above",
   才 (Adv, L2) = "only just, not until", 正 (Adv, L1) = "in the middle of doing", 牛 (Adj, L5) =
   "awesome", 棒 (Adj, L5) = "excellent", 说法 (N, L5) = "way of saying", 白酒 = "baijiu, Chinese
   grain spirit", 版 = "edition, version".
3. Add four build-failing gates so this cannot regress: (a) a register deny-list — no gloss
   containing slang, sexual, dialect, `fig.` or variant-character content ships, ever (4 live today,
   one at HSK 1); (b) no two cards sharing hanzi+pinyin across levels may ship the same primary
   gloss (10 violate); (c) no gloss may be the entry's own toneless romanization (2 violate);
   (d) a verb-form gloss (`to …`) may not lead a card whose only POS is N/Adj/Adv, and vice versa
   (说法, 买卖, 会 L2, 棒, 牛 L5, 才 L2 all violate).
4. Split the 面 card back into 面1 / 面2 as the reference numbers them, carrying 麵 as 面2's
   traditional form, and give 为 L3-0752 its prepositional gloss instead of a second verb gloss.

The structural spine is already correct and must not be touched — 4,316/4,316 ids, 0 level, hanzi,
pinyin or POS mismatches. This is an English-authoring job with a gate around it, not a rebuild.
