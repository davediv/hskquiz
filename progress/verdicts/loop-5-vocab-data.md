# loop-5 — vocab-data

**Verdict: FAIL** — and for the first time the failure is purely orthographic. The corpus is
*right*: every word is present, at the right level, with the right sense and the right tone marks.
What it gets wrong is how it *spells* what it knows. Two majors survive, and both are the same
sentence typed the wrong way.

**Loop 4's ask was delivered and overshot.** Loop 4 asked for the 969 HSK 3 example sentences; all
five levels shipped. `node scripts/build-vocab.mjs --verify` → `examples 4308, problems 0,
problemsByGate {}`, examplesPerLevel `{1:500, 2:770, 3:969, 4:999, 5:1070}` — reproduced on my own
count off the shipped JSON: 4,308 of 4,308 cards carry an example, 0 missing. Quality holds under
independent measurement too: headword absent 0/4308, hanzi/syllable misalignment 0/4308, sentences
over 20 characters 0, duplicate hanzi 0, duplicate English 0, characters above the card's own level
0, 不/一 sandhi correct on all 1,044 instances. `progress/shots/loop-5/vocab-data-quiz5-mobile.png`
shows the sentence panel live on an HSK 5 teach card where loop 4 photographed a filler panel.

**Vocabulary fidelity is a genuine pass and should not be re-audited.** 4,316/4,316 official ids
covered, 0 phantom ids, 0 level mismatches, 0 POS drift, 2,367/2,367 traditional forms correct, all
8 collapsed rows verified individually as same-hanzi + same-pinyin variants with both senses kept
(老, 省, 把, 初, 任, 为, 批, 品). Sense selection — the axis loop 4 flagged — is clean: 穿 is fixed,
带 ships "to take along" against CEDICT's "band; belt", 才 is correctly split cái-Adv L2 / cái-N L4.
Two independent readers of ~110 and ~60 hand-picked cards found **zero** wrong-for-level primary
senses.

**Weighed out.** Two of the critic's seven findings do not survive:

- **"14 words drop the neutral-tone dot; 63 are honoured" is refuted as written.** There are 77
  rows with `·` in `officialPinyin` and **0 of them are honoured** — I checked every one against the
  shipped `syllables` array and all 77 print a full tone (别人 `[bié/2, rén/2]`, 学生 `[xué/2,
  shēng/1]`, 太阳 `[tài/4, yáng/2]`). `displayPinyin()` in `scripts/build-vocab.mjs` strips `·`
  unconditionally, so the dot cannot be honoured on any row. The 63/14 split does not exist, and
  what actually distinguishes the critic's 14 is the `∥` separability marker, which is on 189 rows,
  not 14. The *observation* is real; the finding is superseded by finding 2 below, which measures
  the same defect correctly against a source that is unambiguous.
- **"~1 in 25 example translations are keyed to the gloss" is refuted.** An independent 45-sentence
  sample from L4/L5 found 0 of this kind. The two named cards are arguable, not wrong: 个体 genuinely
  carries the biological sense its card was deliberately disambiguated to, and 分散注意力 does
  literally mean to scatter attention. No reproducible rate.

## Surviving findings

### 1. MAJOR — pinyin is written character-by-character, not in words: 0 of 42,112 sentence tokens join two syllables, and 192 headwords ship an invented space

The single most-visible line on every card contradicts both Pleco and the app itself.

`progress/shots/loop-5/vocab-data-pinyin-split-mobile.png` is the whole thing on one screen: the
hero reads **bǎochí** joined, and four lines below the sentence reads **"Qǐng dà jiā bǎo chí ān
jìng."** — 大家, 保持 and 安静 all split, including the headword the red underline points at. Pleco
sets that as "Qǐng dàjiā bǎochí ānjìng." The bar is in the repo:
`reference/screenshots/pleco/pleco-iphone-02.png` prints "Wǒ zài wùlǐxué fāngmiàn de zhīshi, jīhū
děngyú líng." — every polysyllable joined. Same defect on
`progress/shots/loop-5/vocab-data-quiz5-mobile.png` (hero `shǔbiāo`, sentence `shǔ biāo`) and
`progress/shots/loop-5/vocab-data-jile-mobile.png` ("Zhè ge xiāo xi ràng dà jiā gāo xìng jí le.").

Measured on my own scripts: **0 of 42,112** example-pinyin tokens contain more than one vowel
nucleus, while **3,067 of 3,372** multi-syllable headwords are joined. **4,172 of 4,308** sentences
contain at least one multi-character corpus word, so this is the whole corpus.

The critic saw half of it. The other half is in the headwords, and no loop has named it before:
**192 of the 305 spaced headwords have a space that exists in no source.** `displayPinyin()` does
`.replace(/∥/g,' ')`, converting the official list's separability *marker* into a printed space —
帮忙 → "bāng máng", 睡觉 → "shuì jiào", 结婚 → "jié hūn", 值得 → "zhí dé", 打开 → "dǎ kāi". The
reference refutes every one of them on the very same row: alongside `officialPinyin` each entry
carries a second, already-clean `pinyin` column with no marker — 帮忙=bāngmáng, 值得=zhídé,
出来=chūlái. Only 113 of the 305 spaces are genuine. This also contradicts the app's own written
contract: `src/lib/design/Pinyin.svelte` documents that "the gaps... are the official list's own and
this component keeps every one of them and invents none" — but the gap was invented upstream in the
build, so `pinyin.spec.ts` passes on a string that already carries the defect.

The mechanism for the sentence half is in the render path, not just the data:
`ExampleSentence.svelte:115` passes `syllables={run.syllables}` with no `pinyin` prop, so
`Pinyin.svelte`'s source string is `''`, `sourceSeparators` returns null, and the component falls
through to the `spaced` branch that emits one space per syllable. Its own doc-comment names this as
the automatic consequence of passing syllables with no string to read them out of.

### 2. MAJOR — 42 cards print a full tone on a syllable that the CEDICT key they were segmented by marks neutral

`keySyllables()` in `scripts/build-vocab.mjs` already parses CC-CEDICT's tone digits (5 = neutral)
to segment every headword — then throws the digit away and reads the tone off the printed diacritic
instead. Result, reproduced exactly: **42 cards** ship a full tone where their own key says neutral.
学生 `xuéshēng` against `[xue2 sheng5]`; 聪明 `cōngmíng` against `[cong1 ming5]`; 太阳 `tàiyáng`;
关系 `guānxì`; 小姐 `xiǎojiě`; 位置 `wèizhì`; 合同 `hétóng`; 值得 `zhí dé`; also 别人, 不客气, 记住,
那里, 起来, 道理, 好处, 态度, 味道, 心里, 照顾, 后面, 价钱, 力量, 尺寸, 夫人, 教训, 看来, 活泼,
逻辑 and 18 more. **29 of the 42 are also dotted in the official list**, so both available
authorities agree and the card contradicts both.

This is not only letters. `progress/shots/loop-5/vocab-data-zhide-mobile.png` shows 值得 rendered
"zhí dé" in the hero, again in the sentence line, with 得 painted 2nd-tone green — so the learner
reads the wrong tone off the colour too. And `WordSheet.svelte:492` calls `speak(word.hanzi,
'word')`, so the speaker button on that same card says *zhíde*. One card, one button, two
pronunciations.

### 3. MINOR — the sentence line and the headword line print the same word two different ways, ~181 times across 45 words

Nothing in the build gates it: the verify step checks that a sentence's syllable count matches its
character count, never that a word reads the same in a sentence as on its own card. Proper nouns
lose their capital everywhere but position 0 — 中国 is `Zhōngguó` on its card and `zhōng guó` in all
40 sentences that contain it (`我想吃中国菜。 | wǒ xiǎng chī zhōng guó cài`); 汉语 `Hànyǔ` vs `hàn
yǔ` 24×, 中文 11×, 北京 10×. Neutral tone flips both directions: 网上 card `wǎng shang` vs sentence
`wǎng shàng` 10×, 家里 8×, 留下 7×; and 学生 card `xuéshēng` vs sentence `xué sheng`. Even adjacent
cards disagree: 个 L1's 我有两个哥哥 writes `liǎng ge` while 一 L1's 我有一个哥哥 writes `yí gè`.

### 4. MINOR — 面 (L2) still ships without "face" — loop 4's ask, the only one not acted on

面 L2-0377 ships `["side","surface","measure word: flat things"]`; the reference's 面1 leads its
cedictDefs with "face", and 脸 L2-0351 ships `["face"]`. The distractor guard cannot see this by
construction: `senses.ts:277` defines `senseSet(word)` over `word.meanings` only, so a sense deleted
from the shipped glosses is invisible to the collision check and 面/脸 stay eligible as a pair. A
corollary neither loop drew: 面1/面2 are the **only** one of 19 same-level homograph pairs not
separated by pinyin — both ship `miàn` at L2 as consecutive rows, so with "face" gone the browse
list shows two adjacent 面 miàn rows distinguished only by gloss. (The guard is otherwise doing real
work: 0 duplicate primary button texts within any level, across 236 shared sense keys.)

### 5. MINOR — 极了 and 分之 still strip the official ellipsis, fourth loop running

Reference L3-0318 is …极了 and L4-0242 is …分之…; both ship bare, and they are the only 2 of 4,308
cards whose pinyin fails to match a reference field when the ellipsis is kept. Largely defused now:
`progress/shots/loop-5/vocab-data-jile-mobile.png` shows the qualified gloss "after an adjective:
utterly" plus 这个消息让大家高兴极了。, which teaches the pattern in situ. But the 96px hero is still
a string that never occurs alone.

### 6. MINOR — 谁 and 熟 are the only 2 cards whose `syllables` array does not spell their `pinyin`

谁 ships `"shéi/shuí"` with `[{shéi,2}]`, 熟 ships `"shú/shóu"` with `[{shú,2}]`. Renders without
error today because both variants happen to be 2nd tone and the leftover text rides along in
`sourceSeparators`, but any consumer reading `syllables` loses the variant silently.

## Biggest gap

**Re-emit every pinyin string in word units instead of one syllable per token — in the 4,308 example
sentences and in the 192 headwords the `∥` marker wrongly split — and honour neutral tone from the
CEDICT key while you are in that function.**

Concretely, in `scripts/build-vocab.mjs`:

1. Stop turning `∥` into a space. `displayPinyin()` should drop the marker (and the optional-syllable
   parenthetical on 有些/有点儿/差点儿), not print it, so 帮忙 → `bāngmáng`, 值得 → `zhíde`,
   出来 → `chūlái`. Validate each result against the reference row's own clean `pinyin` column, which
   already has the right answer for all 192; leave the 113 genuinely space-separated entries such as
   岸上 `àn shang` alone.
2. Give each example sentence word-group boundaries alongside its per-syllable array, joining tokens
   only where the corpus itself already treats them as one word, and have `ExampleSentence.svelte`
   pass a joined source string to `<Pinyin>` so it stops falling into the `spaced` branch. **Do not
   lose the 1:1 syllable-to-character alignment** — the headword underline depends on it and it
   currently holds on all 4,308 sentences.
3. Read the tone off CEDICT's digit, not off the diacritic: where the key says `5`, emit a toneless
   syllable with `tone: 0` so `<Pinyin>` colours it neutral. That fixes 学生 → `xuésheng`,
   太阳 → `tàiyang`, 关系 → `guānxi`, 值得 → `zhíde` and 38 others, and makes the printed pinyin agree
   with what the Listen button already says.

Done means: every multi-syllable corpus word renders as one token in both the hero and the sentence
line; 0 headword spaces that the reference's `pinyin` column does not have; 0 cards printing a full
tone where their CEDICT key says 5; and `node scripts/build-vocab.mjs --verify` still reports
`problems: 0` with syllable-count alignment unbroken. Re-shoot 保持, 值得 and 学生 and check the hero
and the sentence line spell the word the same way.
