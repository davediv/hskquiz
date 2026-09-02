# loop-6 — vocab-data

**Verdict: FAIL** — but the failure has moved off the data and onto its *shape*. Every word is
present, at the right level, with the right sense, the right tone marks and now the right
orthography. What still breaks is the labelling: parts of speech float over senses they do not
belong to, and the corpus writes its glosses in one English and its sentences in another.

**Loop 5's gap is CLOSED, and I reproduced every number of it myself.** Headword spaces 305 → 113,
and all 113 are the reference's own (`岸上 àn shang`, `网上 wǎng shang`) — 0 invented, down from
192. 3,259 of 3,372 multi-syllable headwords now join. Example pinyin went from 0 joined tokens of
42,112 to 11,182 multi-character tokens of 30,651, of which exactly 16 are not themselves an
HSK1–5 headword and all 16 are real words (中秋, 玩笑, 好意思, 中华, 耐烦). 1:1 syllable-to-character
alignment survived the rewrite intact — span sums equal character counts on all 4,308 sentences, 0
exceptions. Full-tone-over-CEDICT-neutral: 42 → 1.
`progress/shots/loop-6/vocab-data-zhide-mobile.png` is loop 5's exact re-shoot: hero `zhíde` with
得 painted neutral, sentence `Zhè běn shū hěn zhíde yì dú.` — same spelling in both places.
`progress/shots/loop-6/vocab-data-xuesheng-mobile.png` the same for `xuésheng`;
`progress/shots/loop-6/vocab-data-baochi-mobile.png` ships `qǐng dàjiā bǎochí ānjìng`.

**All four pass/fail gates pass and should not be re-audited.** Coverage: 4,316/4,316 official ids,
0 phantom; the 8 collapsed rows (老 L2, 省 L2, 把 L3, 初 L3, 任 L3, 为 L3, 批 L4, 品 L5) are each the
same hanzi + pinyin + level + cedictKey differing only in the official POS annotation, both senses
kept. Level: 0 mismatches. Tone: the headwords that differ from the raw reference string are all
deliberate transforms (neutral read off CEDICT's `5`, variant bars collapsed, parentheticals
dropped); traditional 2,367 forms with the single 面 → 麵 difference, which is correct. Sense
selection: 0 wrong-for-level primaries across ~600 hand-read cards plus my own overlap sweep.

**Weighed out.** Nothing was refuted this loop — the adversarial verifier reproduced all eight
findings. Three counting corrections are folded in below: the chip-contradicts-gloss count is **16,
not 11** (I measured 16 myself — the critic's detector only matched glosses starting with "to" and
missed five measure-word rows); the "65 headwords differ from the reference" is 44 under a stricter
normalisation, a convention not a defect; and the neutral-tone audit was run one-directionally —
the other direction finds 27 cards printing neutral where CEDICT marks a full tone, and every one
is faithful to the reference's own `officialPinyin`, so it is clean.

## Surviving findings

### 1. MAJOR — part of speech is bound to the card, not to the sense: 477 cards, 16 rows where the visible chip contradicts the visible gloss, and one card advertising a sense it does not ship

`WordRow.svelte:34` is `const pos = $derived(posPrimary(word.pos))` — `pos[0]` — printed beside
`word.meanings.join(', ')`, with nothing linking the two arrays. On 60 of the 477 the arrays are not
even the same length, so no positional reading is recoverable.

`progress/shots/loop-6/vocab-data-L5zh-desktop.png`, last row of the right column, reads
**"震惊 zhènjīng · ADJ. to shock, to astonish"** — the label and the gloss cannot both be right.
`progress/shots/loop-6/vocab-data-zhenjing-mobile.png` shows the sheet heading
**"ADJECTIVE · VERB"** over "1 to shock / 2 to astonish": both glosses are verbs, so the adjective
reading the card advertises ("shocked, astonished") is simply absent from the corpus.
`progress/shots/loop-6/vocab-data-mian-mobile.png` is the same defect in its other form —
"NOUN · MEASURE WORD" over *side / face / measure word: flat things*, where only sense 3 is the
measure word.

The full 16, reproduced on my own scan: 明白 L1 (Adj · "to understand clearly"), 感动 L2 (Adj),
好像 L2 (Adv), **节 L2 (N · "measure word: class periods")**, **瓶 L2 (N · "measure word:
bottles")**, 午睡 L2 (N), 小心 L2 (Adj), 记录 L3 (N · "to write down"), **所 L3 (N · "measure word:
schools or houses")**, **批 L4 (V · "measure word: batches")**, 想象 L4 (N), 害 L5 (N),
**盒 L5 (N · "measure word: boxes of something")**, 为难 L5 (Adj), 震惊 L5 (Adj), 指示 L5 (N).
批 is one of the 8 collapsed rows — the collapse itself put the measure-word gloss first under a V
chip. Pleco heads each sense with its own part of speech
(`reference/screenshots/pleco/pleco-iphone-02.png`: "ADVERB" directly above "almost; nearly;
practically").

### 2. MAJOR — the corpus does not speak one English: glosses American, sentences British, 28 cards contradicting themselves

The gloss is the quiz's answer text, so the learner reads one dialect on the button and the other
in the sentence directly beneath it. On my own marker list: 114 example sentences carry a British
form against 21 American, while 69 glosses carry an American form against 19 British — the skew
runs *opposite* in the two columns. 28 cards contradict themselves outright: 妈妈 "mother, mom" over
"My mum is forty this year."; 颜色 "color" over "What colour do you like?"; 加油站 "gas station" over
"There's a petrol station at the crossroads ahead."; 电梯 "elevator, escalator" over "The lift in
this building has broken down again."; 垃圾 "trash, garbage" over "take the rubbish down";
练习 "to practice" over "I practise writing Chinese characters every day."; 米 "meter" over "He ran a
hundred metres."; 足球 "soccer, a soccer ball" over "watch the football match"; 灰色 "gray" over "The
sky is grey"; 邻居 "neighbor" over "My neighbour is a retired teacher"; also 公里, 红色, 练, 彩色,
剧场, 裤子, 寒假, 加入, 落, 平方, 汽油, 秋季. Pleco picks one register and holds it.

### 3. MINOR — two 面 cards at L2 are pixel-identical in the browse list and on the recognition prompt

L2-0377 and L2-0378 both ship hanzi 面, pinyin miàn, level 2 — the **only** pair in 4,308 cards with
identical hanzi *and* identical pinyin at one level. The reference disambiguates them ("面1" / "面2")
and the build strips the superscript. The list shows "面 miàn · n. side, face, measure word: flat
things" and "面 miàn · n. noodles, flour" as two rows a learner cannot tell apart; only the sheet's
traditional field (面 vs 麵) separates them. Not a two-right-answers bug — `isAmbiguousWith`'s
`candidate.hanzi === answer.hanzi` clause blocks the pair — but the recognition prompt for the two
cards is the same 96px glyph.

### 4. MINOR — 76 example sentences split a compound number into two tokens

The word-unit rewrite covered corpus words but not numerals.
`progress/shots/loop-6/vocab-data-xuesheng-mobile.png` — the very card loop 5 asked to re-shoot —
reads "Wǒmen bān yǒu **sān shí** ge xuésheng." where both Hanyu Pinyin orthography and Pleco write
`sānshí`. Same shape in 我妈妈今年四十岁 → `sì shí suì`, 学校里有一百个学生 → `yì bǎi ge`,
我们班有二十个学生 → `èr shí ge`, 这本书有两百页 → `liǎng bǎi yè`, 今天的气温超过了三十度 →
`sān shí dù`. 76 sentences, reproduced exactly. Every polysyllabic *word* in those same sentences is
correctly joined, so the numeral is the one class the rewrite missed.

### 5. MINOR — …极了 and …分之… still ship with the official ellipsis stripped, fifth loop running

Reference L3-0318 is `…极了` and L4-0242 is `…分之…`; the cards ship `极了` and `分之`. After
normalising variant bars, parentheticals and superscripts these are the **only 2 of 4,308** hanzi
that differ from the reference at all — the pinyin and traditional checks isolate the same two rows.
The 96px hero on both is a string that never occurs standalone. Partly defused by the gloss
("after an adjective: utterly") and the in-situ sentence, but the headword itself is still wrong.

### 6. MINOR — ~11 same-level paraphrase pairs are still eligible to be drawn onto one card

Run against the real `makePool` + `isAmbiguousWith` over the real shipped levels: 没事儿 "it's all
right" / 行 "all right" (L1); 举 / 举手 (L2); 接 / 取 (L2); 对 / 往 (L2); 领先 / 前面 (L3);
泪 / 眼泪 (L4); 转动 / 转身 (L4); 当前 / 跟前 (L5); 忍 / 约束 (L5); 抬头 / 尊敬 (L5). The guard is
doing real work elsewhere — it correctly refuses 季/季度, 赠/赠送, 刚才/刚刚, 高速/快速, 夫妇/夫妻,
面/脸 — and there are 0 duplicate primary glosses in any level. `senses.ts` names this residual in
its own doc-comment ("Those need a thesaurus, not a string compare"); this is its measured size.

### 7. MINOR — four pinyin residuals the rewrite did not reach

谁 L1-0325 ships `"shéi/shuí"` with syllables `[{shéi,2}]` and 熟 L2-0500 ships `"shú/shóu"` with
`[{shú,2}]` — the only 2 slash pinyin in the corpus, and any consumer reading `syllables` loses the
variant silently (second loop running). 看上去 L3-0412 ships `kàn shàngqu`… with 上 at tone 4 against
its own key `[kan4 shang5 qu5]` — the single remaining full-tone-over-neutral syllable. 获 L4-0345's
sentence renders 她的作品获得了今年的大奖。as `tā de zuòpǐn huò déle jīnnián de dà jiǎng`, splitting
the corpus word 获得 into 获 + 得了 where the 获得 card itself spells it `huòdé`. And two sentence
tokens read differently from the card that owns the headword: 接下来's example prints `xiàlái` while
下来 L3-0773 prints `xiàlai`; 看上去's example prints `shàngqu` while 上去 L3-0616 prints `shàngqù` —
the only 2 such disagreements out of 11,182 multi-character tokens.

## Biggest gap

**Bind each part of speech to the sense it labels. Stop shipping `pos` as a card-level array with no
link to `meanings`; re-emit every card's senses as an ordered list of `{pos, gloss}` groups.**

震惊 becomes Adj → "shocked, astonished" / V → "to shock, to astonish". 记录 becomes V → "to write
down" / N → "a written record". 面 L2-0377 becomes N → "side", N → "face", M → "measure word: flat
things". 批 L4 becomes V → "to arrange in batches", M → "measure word: batches". Then render it the
way Pleco does — `WordSheet.svelte:541` heads each numbered sense with its own label instead of one
"ADJECTIVE · VERB" banner over an undifferentiated list, and `WordRow.svelte:34` prints the chip
belonging to the gloss it is standing next to, not `pos[0]`.

Done means: (a) **0** browse rows where the printed chip's category disagrees with the gloss beside
it — the full list today is 16, not 11: 明白, 感动, 好像, **节**, **瓶**, 午睡, 小心, 记录, **所**,
**批**, 想象, 害, **盒**, 为难, 震惊, 指示, where the five bolded are measure-word glosses under an N
or V chip that the last sweep missed; (b) every POS code a card advertises has at least one gloss
under it, so an advertised sense can no longer be missing the way 震惊's adjective reading is now;
(c) the sheet heads each sense with its own part of speech
(`reference/screenshots/pleco/pleco-iphone-02.png` prints "ADVERB" directly above "almost; nearly;
practically"); and (d) the 60 cards whose `pos.length` and `meanings.length` disagree are resolved
in the build rather than left to positional guesswork. Scope is the 477 multi-POS cards; the 386
cards the official list gives no POS for stay chip-less as they are today.

Re-shoot 震惊 (L5), 记录 (L3), 面 (L2) and 点 (L1) in both the browse row and the sheet, and check
the chip over each numbered sense is the one that sense actually is.
