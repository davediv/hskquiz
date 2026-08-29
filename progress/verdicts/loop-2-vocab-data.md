# Verdict — vocab-data, loop 2

**PASS: no.** But this is a very different verdict from loop 1, and the headline the critic filed is
wrong. The critic's only `fail` — "the shipped JSON is stale, 土豆 tells a learner it means peanut" —
does not describe the delivered artefact. I rebuilt an isolated `git archive HEAD` copy and the
committed data at `42e883d` is **byte-identical** to a fresh `node scripts/build-vocab.mjs` for all
five levels. At HEAD, 土豆 `["potato"]`, 家人 `["family member"]`, 出租车 `["taxi"]`, 计算机
`["computer"]`, 冰箱 `["refrigerator"]`, 权利 `["right"]`. None of the six wrong glosses ship.

What is real is that the **uncommitted working tree** carries them. `src/lib/data/hsk{1,2,4,5}.json`
and `sizes.ts` are modified vs HEAD, mtime `02:31:27`, matching no commit in the repo — written
*during* the review, not before it. The critic's claim that "`--verify` reports problems: 0 against
the stale files" is false; run against those exact files it reports 4 problems, and
`vitest run src/lib/data/vocab.spec.ts` fails on them right now. So
`progress/shots/loop-2/vocab-data-stale-tudou-mobile.png` is a photograph of a contaminated tree, not
of the piece, and is void as evidence. **Residue for the next builder: run `git checkout -- src/lib/data`
before anything else.** The gate works; nothing needs building to make it work.

What survives is smaller than loop 1 by a long way. All 18 loop-1 named offenders are fixed, 面 is
split back into two rows with 麵 restored, and the whole quiz-usability battery is clean:
4,316/4,316 official ids accounted for, 0 level / hanzi / pinyin / tone mismatches across 7,905
syllables, 0 same-level duplicate primaries under the current gate, 0 glosses equal to their own
romanization, 0 internal commas, longest primary 34 chars.

## Blind design judge

None run for this piece (`progress/blind/loop-2/` has no `vocab-data` directory). vocab-data has no
screen of its own; it is judged through vocab-browse and quiz-card.

## Surviving findings

### Major

**1. Both the build gate and the runtime distractor guard split senses on `;` and `/` only — so the
house style's own "X or Y" glosses hide same-answer collisions from both.**
`senseSet()` in `src/lib/session/distractors.ts:29` and the deliberately identical `senseKeys()` in
`scripts/build-vocab.mjs:694` both do `meaning.split(/[;/]/)`. But the authored house style writes
compound senses with the word "or" — visible on screen in
`progress/shots/loop-2/vocab-data-l5-desktop.png`: 岸 "shore or coast, riverbank", 版 "edition or
version". Splitting on `\s+or\s+` as well exposes **109 same-level pairs** that share a sense neither
gate can see, **47 of them in the two cards' *primary* glosses** — and `meanings[0]` is the answer
button text. Unambiguous two-right-answer cases, all verified against HEAD data:

| level | pair | both mean |
| --- | --- | --- |
| L3 | 衬衫 `["shirt"]` vs 衬衣 `["a shirt or blouse"]` | shirt |
| L5 | 餐馆 `["restaurant"]` vs 餐厅 `["a restaurant or dining hall", …]` | restaurant |
| L3 | 地区 `["a region or district"]` vs 区 `["district","zone"]` | district |
| L4 | 类型 `["type","category"]` vs 型 `["a type or model"]` | type |
| L5 | 地带 `["zone"]` vs 区域 `["a zone or area"]` | zone |
| L5 | 鼠 `["rat or mouse"]` vs 鼠标 `["mouse"]` | mouse |
| L2 | 该 `["should or ought to", …]` vs 应该 `["ought to", …]` | ought to |
| L3 | 采取 `["to adopt or carry out", …]` vs 采用 `["to adopt", …]` | adopt |
| L5 | 不良 `["harmful or bad", …]` vs 有害 `["harmful", …]` | harmful |

The same normaliser also scrubs apostrophes to a space, so L3 就是 `["it's just that"]` → `it s just
that` never matches 只是 `[…,"it is just that"]` → `it is just that`; these two co-occur ~106 times
per 90,000 questions. Same for 恐怕 / 怕 ("I'm afraid that" / "I am afraid that"), 长处 / 优点
("strong points" / "strong point"), 感情 / 情感 ("emotions" / "emotion"). Measured exposure on
*scored* cards: 32 per 30,000 questions (0.11%) at streak 2, 衬衫/衬衣 alone accounting for 11 of
them — in meaning-to-hanzi, where the prompt is literally the word "shirt" and both buttons are right.

*(The critic filed a much larger version of this — "1.0% of 18,000 questions", 听见/听到 and 看见/看到
colliding — and it does not reproduce. Over 90,000 driven questions 听见/听到 co-occur **0 times** and
看见/看到 **0 times**; the 1.0% metric re-runs at 0.38% and mostly counts pairs the authoring
successfully disambiguated on screen; and with `progress = null` every card returns `kind: 'introduce'`,
which `kindIsScored()` excludes from grading, so the named victim cannot be graded wrong at all. The
mechanism is real, the scale was not. What is above is the part that survives measurement.)*

**2. ~12 wrong primary senses in the 833 compounds that were never hand-authored.**
3,475 of 4,308 cards carry an authored override; the 833 residue contains **0 single characters**
(761 two-char, 72 three-char), so the machine picker now only runs on compounds. `meanings[0]` is the
quiz answer text, so a wrong primary is a wrong answer, not a footnote. Verified against HEAD:

- 校长 L2 `["president","headmaster"]` — from CEDICT "(college, university) president"; a 校长 is a school principal
- 课文 L1 `["text"]` — it is the text *of a lesson*
- 名片 L4 `["card"]` — from "(business) card"
- 平原 L5 `["field","plain"]` — a 平原 is a plain, not a field
- 频道 L5 `["frequency","channel"]` — a 频道 is a TV channel; 频率 is frequency
- 引进 L4 `["to recommend","to introduce"]` — the L4 sense is importing technology
- 诗人 L4 `["bard","poet"]`; 相片 L4 `["image","photograph"]`; 大妈 L4 `["father's elder brother's wife","aunt"]`
- 体操 L4 `["gymnastic","gymnastics"]` and 胆小 L5 `["cowardice","timid"]` — wrong part of speech leading the card
- 来自 L2 `["to come from","From"]` — stray capital F

103 of the 833 have a primary whose source CEDICT sense had a parenthetical qualifier stripped; that
is where the defects cluster. The critic put this at ~50 (6.3% of a 240-card sample); a full read of
all 833 puts it at ~12 (~1.4% of the residue, ~0.3% of the corpus), and 4 of the critic's 9 named
examples are secondary-gloss quibbles filed under a primary-sense headline (爱人 `meanings[0]` is
"spouse", which is correct; 嘴巴 "mouth"; 老太太 "elderly lady"; 陆地 "dry land" is standard).

### Minor

**3. One gloss ships an unbalanced double quote, straight onto an answer button.**
L3 老百姓 → `["ordinary people", "the \"person in the street"]`. The closing quote was truncated. It is
the only broken-punctuation gloss in the corpus — and the critic explicitly certified this battery
clean, so nothing in the loop caught it.

**4. The 初 merge drops the exact sense its second official row exists to carry — and the mechanism is general.**
All 8 same-hanzi collapses (老, 省, 把, 初, 任, 为, 批, 品) are the same word at the same level under two
POS labels, so no distinct word vanished. But 初 fuses L3-0102 (Adv) with L3-0103 初（初一）(Prefix)
and ships `["at the beginning","early"]` with `pos: ["Adv","Prefix"]` — the lunar-date prefix reading
(初一…初十) is gone. The cause is in the merge:
`if (!prev.authored && e.authored) prev.meanings = e.meanings; else if (!prev.authored) { union }`.
When the surviving row *is* authored, the second row's meanings are discarded with no union. All 8
first rows are authored, so the other 7 survive only because a human happened to write both senses
into one override by hand.

**5. Cross-level pairs whose glosses differ in bytes but not in meaning — the gate only tests string inequality.**
一会儿 L1 `["a short while","a moment"]` vs L2 `["in a moment","for a short while"]`; 一下儿 L1
`["briefly","just once"]` vs L5 `["for a short moment","briefly"]`; 米 L2 `["meter"]` vs L3
`["uncooked rice","meter"]`, where L2's entire primary is L3's secondary. Separately, **194 distinct
primary glosses are shared by two or more cards across levels** — 电脑 L1 and 计算机 L2 both ship
exactly `["computer"]`; 饭店 L1, 饭馆 L2 and 餐馆 L5 all lead with "restaurant"; 父亲 L3 duplicates
爸爸 L1 "father". Quiz-safe, because `buildSession` filters `word.level === level`, but the browse
list shows the same English on two different words.

**6. Two bound forms ship as headwords that are not words.**
Exactly two reference rows carry the official ellipsis notation — L3-0318 `…极了` and L4-0242
`…分之…` — and both ship with it stripped: hanzi `极了` "to an extreme degree", hanzi `分之` "used to
say fractions: two thirds". `headwordSize()` gives 分之 the two-character hero step, so a quiz card
renders 分之 alone at ~96px, a string a learner will never meet in text.

**7. 386 cards render with no part-of-speech label, and nothing was designed for that case.**
Confirmed exactly: 386 empty `pos` arrays (L1 76, L2 95, L3 61, L4 78, L5 76) against exactly 386
reference rows with an empty POS field — faithful to the standard. But the browse row indents behind
the grey `V.` / `N.` chip, so those 386 rows break the column. Visible in
`progress/shots/loop-2/vocab-data-l5-desktop.png` (岸上 "ashore, on the riverbank" and 报警 "to call
the police" flush left between indented neighbours) and in
`progress/shots/loop-2/vocab-data-search-jian-mobile.png` (见面 and 听见 break the column 见 and 再见
establish). Unchanged from loop 1.

## Biggest gap

**Teach the sense splitter the word "or", in both places it lives, then fix everything it flags.**

In `src/lib/session/distractors.ts` (`senseSet`, line 29) and in the deliberately identical
`senseKeys` in `scripts/build-vocab.mjs` (line 694), change `split(/[;/]/)` to
`split(/[;/]|\s+or\s+/)` and expand the normaliser to fold contractions (`it's` → `it is`, `I'm` →
`I am`) and trailing plurals before comparing. Then run the build: the gate will fail on the 47
same-level pairs whose primary glosses now collide, and each one is a card where a learner picks a
correct answer and is graded wrong — 衬衫 `["shirt"]` against 衬衣 `["a shirt or blouse"]`, 餐馆
`["restaurant"]` against 餐厅 `["a restaurant or dining hall"]`, 地带 `["zone"]` against 区域 `["a zone
or area"]`. Resolve each by disambiguating the **Chinese** — a usage tag a learner can match on
("shirt (formal, buttoned)" vs "shirt or blouse (general)") — never by inventing a paraphrase, which
is what produced 听见 "to catch a sound" and only moves the collision somewhere the guard cannot see
it. This is the one defect class in the piece where the app tells a learner they are wrong when they
are right; everything else on this list is a gloss quality issue.
