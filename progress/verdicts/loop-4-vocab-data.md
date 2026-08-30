# loop-4 — vocab-data

**Verdict: FAIL** — but a different failure from loops 1–3. The corpus is now *correct*. What it is
not is *finished*: 70.5% of the cards teach nothing but a gloss.

The loop-3 verdict's two FAILs (听见 "to catch a sound", 衬衣 "underclothes") are gone, and the
independent audit against `reference/hsk` came back clean on every fidelity axis that matters — 0
missing words, 0 wrong levels, 0 wrong tone marks, `syllables[]` 1:1 with hanzi on all 4,308 cards,
POS sets identical to the reference except the 8 deliberate same-hanzi merges, traditional forms
correct on all 2,366 words that have one, 0 duplicate ids, 0 duplicated meaning sets,
`node scripts/build-vocab.mjs --verify` → `problems: 0`. The 8 collapsed rows were re-checked one by
one and every merge is same-hanzi *and* same-pinyin with both senses kept; 为 wèi (L2) and 为 wéi
(L3) were correctly **not** merged. Data quality is no longer the problem here.

**Weighed out this loop.** Four of the critic's seven findings do not survive:

- **The headline FAIL (游/游泳 and 16 same-level pairs) is refuted.** The mechanism is real —
  `senseSet(游)={swim, roam about}`, `senseSet(游泳)={swimming}`, no intersection, `isAmbiguousWith`
  returns false — but the picker never reaches it. I re-ran the app's own `buildSession` over
  **75,000 real questions** (1,500 sessions × 10 × 5 levels, `mulberry32` seeds): **游/游泳 collided
  0 times**, as did 家里/家, 在家/家, 地上/地, 整体/整, 做梦/梦, 转动/转身, 状况/状态, 实际上/事实,
  扮演/起到, 全部/所有, 还有/也. `pickDistractors` consumes best-first from a plausibility bucket and
  takes 3; 游 ranks behind hundreds of better candidates for 游泳. The named example is unreachable.
- **"64 POS labels contradict the gloss beside them" is refuted.** `WordRow.svelte:35` renders
  `word.meanings.join(', ')`, not `meanings[0]`. The critic's own cited shot
  `progress/shots/loop-4/vocab-data-desktop.png` shows 爱好 as `V.  hobby, to be fond of` — the verb
  gloss is right there on the same line, justifying the label. The quiz button carries no POS at all.
- **"386 empty-pos cards break the browse column" is refuted, by the critic's own screenshots.**
  `posPrimary` reserves a fixed-width column for exactly this. In
  `progress/shots/loop-4/vocab-data-hear-mobile.png`, 听到 and 听见 start their gloss on the same
  vertical as 好听 ADJ. and 听 V.; in `vocab-data-desktop.png`, 半年/半天/帮忙 align with 班/半/帮.
  Nothing sits flush left. The 386 blanks are faithful to the reference and render fine.
- **一般 / 着 / 次 is editorial opinion, and two of three are contradicted by the source.** 着 zháo's
  shipped primary is literally the reference's own `cedictDefs[1]`; 一般's "so-so" is in the
  reference defs. Only 次 has a fair case. One arguable ordering in 4,308 cards is not a defect.

## Surviving findings

### 1. MAJOR — every word above HSK 2 ships without an example sentence: 3,038 of 4,308 cards

Counted from the shipped JSON: cards with no `example` = **3,038** (L1: 0, L2: 0, L3: 969, L4: 999,
L5: 1,070) — 70.5% of the corpus. `node scripts/build-vocab.mjs --verify` prints
`examplesPerLevel {1:500, 2:770, 3:0, 4:0, 5:0}`.

Seen side by side, and this is the whole finding:

- `progress/shots/loop-4/vocab-data-quiz1-mobile.png` — 用 yòng, with a **SENTENCE** panel:
  我用手机看书。/ wǒ yòng shǒu jī kàn shū / "I read books on my phone." The card teaches.
- `progress/shots/loop-4/vocab-data-quiz5-mobile.png` — 正版 zhèng bǎn, "a genuine edition · a
  licensed copy", and where the sentence should be, a **CHARACTER BY CHARACTER** panel that reprints
  正 zhèng and 版 bǎn under the two characters already rendered at 96px above them.
  `vocab-data-quiz5-q-mobile.png` shows the same on 联想.

The fallback at `QuestionPrompt.svelte:339-340` is a decent hedge but it is not teaching — for a
two-character word it is pure restatement. Pleco and Du Chinese, the named references, never leave a
word without a usage example. The 1,270 sentences that *do* ship are clean: every one contains its
headword, pinyin syllable count matches hanzi character count on all 1,270, no missing tone marks,
no empty English. This is a coverage gap, not a quality one.

### 2. MINOR (real, rare) — the distractor guard only sees the senses the curation *shipped*

Better framed than the critic framed it. `senseSet` runs over `word.meanings`, so **every reference
sense the curation dropped is a collision the guard is structurally blind to.** The sharpest case is
one the critic never mentions:

**面 L2-0377** ships `["side","surface","measure word: flat things"]`. The reference's `cedictDefs`
for 面1 lead with **"face"** — dropped. **脸 L2** ships `["face"]`. On a hanzi-to-meaning prompt the
pinyin is hidden (`QuestionPrompt.svelte:152`, `showSound = shown || hinted`) and the POS is hidden
(`:318`, rendered only `{:else if shown && pos}`), so the prompt 面 carries *nothing* that says which
word is being asked — and 脸 "face" is an eligible distractor. In my 75,000-question run this
produced **4 cards**, e.g. prompt 面 with choices [面 "side" | 脸 "face" | …]. A learner who knows
面 as "face" taps 脸 and is graded wrong.

Full reachable residual over the same 75,000 questions: 两/二 7, 地点/地方 6, 面/脸 4, 一半/半 4,
那/然后 4 — **25 collisions, 0.033%**. Real, worth a fix, not a FAIL. The fix is not more
morphology in `senses.ts`: it is to stop dropping the reference's leading sense (give 面 back
"face"), or to have the guard read `cedictDefs` and not just `meanings`.

### 3. MINOR — 极了 and 分之 still ship as bare headwords that are not words (third loop)

Reference `L3-0318` is `…极了` and `L4-0242` is `…分之…`; both ship with the ellipsis stripped —
极了 `["to an extreme degree"]` and 分之 `["used to say fractions: two thirds"]`, both `pos: []`.
These are 2 of only 5 rows where the shipped hanzi differs from the reference beyond notation
cleanup (the other 3 — 有些, 有点儿, 差点儿 — are defensible). On a quiz card the hero renders
分之 at ~96px, a two-character string the learner will never meet in running text. Filed in the
loop-2 and loop-3 verdicts, unchanged.

### 4. MINOR — 192 English primaries are shared by 2+ cards, covering 396 cards

Reproduced: 饭店 L1 / 饭馆 L2 / 餐馆 L5 all "restaurant"; 电脑 L1 / 计算机 L2 "computer"; 爸爸 L1 /
父亲 L3 "father". Down from loop 3's 199. Quiz-safe, and more strongly than reported: **all 192
groups span more than one level and zero groups contain two cards at the same level**, while
`src/lib/session/index.ts:269` filters the pool by `word.level === level`. These are structurally
incapable of landing on one card. Browse-only cosmetic.

### 5. MINOR — gate (d)'s single-POS blind spot leaves a handful of verb-less verbs

`scripts/build-vocab.mjs:1294` tests `w.pos.length === 1 && w.pos[0] === 'V'`, so a `[V,N]` card
escapes the check entirely. The genuine residual is small — 游泳, 决赛, 胜利, 补贴, 例外, 会谈
declare V and carry no verb sense anywhere in `meanings`. (The critic's larger counts are an English
artifact: 饿 "hungry", 安静 "quiet", 流行 "popular" are Chinese stative verbs with no natural
"to …" gloss.)

### 6. COSMETIC — merge provenance is in the data and invisible to the type

The 8 merged cards carry an `ids` array (e.g. `L2-0339` → `ids: ["L2-0339","L2-0340"]`) that is not
declared on the `Word` interface in `src/lib/types.ts`. Nothing breaks — the JSON is loaded through
an untyped `import.meta.glob` cast — but the type lies about the shape on disk.

## Blind judge

None run this loop.

## Biggest gap

**Write the 969 HSK 3 example sentences and ship them, closing L3 end to end.**

Not a spread across L3/L4/L5 — finish one level so the app has a level where every card teaches.
Every piece of the machinery already exists and is proven on the 1,270 L1/L2 sentences:

- `scripts/sentences/` is the authoring format; the build reads it and attaches `example` per card.
- Gate (g) at `scripts/build-vocab.mjs:1366` already enforces the standard: no character above the
  card's own level, the headword actually appears in the sentence, ≤20 characters.
- `allowedCharacters()` at `:1194` already computes the L3 character budget (899) from the shipped
  corpus itself, so the gate is self-maintaining — no new list to curate.
- The L1/L2 sentences prove the bar is reachable: all 1,270 pass with the headword present and
  pinyin syllable count matching hanzi character count exactly.

Done means `node scripts/build-vocab.mjs --verify` reports `examplesPerLevel {1:500, 2:770, 3:969,
4:0, 5:0}` with `problems: 0`, and a `/quiz/3` teach card looks like
`progress/shots/loop-4/vocab-data-quiz1-mobile.png` (a SENTENCE panel) rather than
`vocab-data-quiz5-mobile.png` (CHARACTER BY CHARACTER reprinting the hero). L4 and L5 follow the
same path in later loops; the pipeline does not change, only the volume.
