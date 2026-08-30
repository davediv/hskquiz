# scripts/overrides/

Hand-authored glosses, read by `scripts/build-vocab.mjs`. Everything in here overrides what the
CC-CEDICT ranker picked, for the official row id it is keyed on.

## The contract

One `.json` file per author. File names and read order carry no meaning — the build reads **every**
`.json` in this directory and merges them — so several people can work the audit list at the same
time without touching each other's file. The same id appearing in two files is a **build failure**,
not a last-writer-wins: one id, one owner.

```json
{
	"L1-0051": {
		"meanings": ["to wear"],
		"note": "CC-CEDICT leads with \"to bore through\"; 穿 at HSK 1 is clothing."
	}
}
```

- `meanings` — 1 to 3 short learner-facing glosses, best first, each 34 characters or fewer.
  `meanings[0]` **is the quiz question** (`src/lib/components/quiz/quiz.ts`), so it has to be the
  sense the official part of speech carries at that level, not the dictionary's first sense.
- `note` — required. Why this gloss and not CC-CEDICT's. One line is enough.

## What to work on

`scripts/vocab-audit.json` is the work list: every card that needs a human-authored primary gloss,
ordered by level then id, each with the official part of speech, the current glosses, the raw
CC-CEDICT senses and the `reasons` it is listed.

A gloss has to clear the first six of eight build-failing gates, all of them also tests in
`src/lib/data/vocab.spec.ts`:

1. **Register** — no slang, sexual, vulgar, dialect, figurative or variant-character content.
2. **Cross-level** — two levels of the same word may not share _any_ sense (白, 才, 牛, 火, 头, 称,
   好, 多, 一会儿, 出口 all led with the same gloss; L2 米 "meter" was L3 米's second gloss).
3. **Romanization** — a gloss may not be the word's own toneless pinyin (包子 is not "baozi").
4. **Part of speech** — the primary gloss agrees with the official POS in all four directions: an
   N/Adj/Adv-only card may not lead with `to …`, a V-only card may not lead with a bare noun, an
   Adj-only card may not lead with a noun (黑暗 "darkness", 长寿 "longevity"), and an N- or Adj-only
   card may not lead with an `-ly` adverb (最近 "recently", 一般 "generally", 原先 "originally").
   The qualifier is not read here — 该 "should (it is one's turn)" leads with `should`.
   A fifth direction is not about the lead at all: a card whose POS is V beside N or M has to carry
   a `to …` sense _somewhere_ in `meanings`, because those four tests only ever looked at
   `meanings[0]` and a `[V,N]` card slipped past all of them — 游泳 shipped "swimming", 决赛
   "finals", 胜利 "victory". It is scoped to V with N or M on purpose: `[Adj,V]` is a Chinese
   stative verb (饿 "hungry", 安静 "quiet") and `[V,Prep]` a coverb (离 "away from", 替 "on behalf
   of"), and neither has a natural `to …` reading in English.
5. **Punctuation** — a gloss closes every quotation it opens (L3 老百姓 shipped
   `the "person in the street`) and every parenthesis: balanced, never nested, never empty, never
   the whole gloss.
6. **Gloss survival** — the word's own English is still on the card. For every reference sense
   short and plain enough to be a _naming_ rather than a reading (at most two content words, no
   parenthetical left after a scope marker comes off, no `sth`/`sb`), at least one has to survive
   in `meanings`. 听见's whole CC-CEDICT entry is `["to hear"]`; whatever else the card says, it has
   to still say "hear". Reviewed exceptions live in `scripts/gloss-survival-allow.json`, one id to
   one line saying why the rewrite is a synonym; an exemption the card no longer needs fails the
   build, so the list cannot quietly turn back into a blanket.
7. **Example level** — not a gloss gate, but it fails the same build. See
   [`scripts/sentences/`](../sentences/README.md): an example sentence may only use characters at
   or below its own card's level, one pinyin syllable per character, and it has to contain the word
   it is an example of.
8. **Example uniqueness** — also not a gloss gate, also fails the same build. No two cards may ship
   the same example sentence or the same English for one; 关 and 关上 both shipped
   "走的时候请关上门。", which is the pair a learner is most likely to meet on one quiz card.

Two more, on top of the gates: within a level no two cards' **primary** glosses may _read_ the same,
and no two cards may share a whole meaning _set_.

## What counts as the same answer

All of that compares glosses through `src/lib/data/senses.ts` — the one implementation, imported by
both the build and the quiz's distractor guard. It splits on `;`, on `/`, **and on the house
style's own `or`**, then strips articles and the verbal `to`, expands contractions and folds a
regular plural head word. So all of these are one answer, and two cards in a level may not both
claim it:

| these are the same answer                      | because               |
| ---------------------------------------------- | --------------------- |
| 衬衫 "shirt" / 衬衣 "a shirt or blouse"        | `or` joins two senses |
| 群 "a crowd" / 人群 "crowd"                    | leading article       |
| 就是 "it's just that" / 只是 "it is just that" | contraction           |
| 感情 "emotions" / 情感 "emotion"               | plural head word      |

It does **not** split an `or` that coordinates two objects of one sense — 戴 "to wear glasses or a
hat" stays one sense, because the alternative is to give 戴 the sense "hat" — and it leaves fixed
phrases (`whether or not`, `more or less`) alone.

## How to resolve a collision

Two same-level cards whose primary glosses answer to the same English are a card where the learner
presses a button reading exactly what the prompt asked and is graded wrong. There are two honest
resolutions and one that is not a resolution at all.

**If the two words really mean different things**, give each card the sense it actually owns and say
in the note which card owns the other one. 采取 "to take measures" against 采用 "to adopt".

**If they really mean the same thing** — and near-synonyms in one level often do — keep the shared
word on **both** cards and put the distinguishing tag in the **same gloss**, in parentheses:

| the pair                                                     | why this shape                    |
| ------------------------------------------------------------ | --------------------------------- |
| 听见 "to hear (and catch it)" / 听到 "to hear (as a result)" | both still answer to `hear`       |
| 衬衫 "shirt (dress shirt)" / 衬衣 "shirt (general word)"     | 现代汉语词典 defines 衬衣 as 衬衫 |
| 可是 "but (spoken)" / 但是 "but (written)"                   | one conjunction, two registers    |
| 该 "should (it is one's turn)" / 应该 "should (ought to)"    | 该 at HSK 2 is the modal          |

`senseKeys` ignores the parenthetical, so the collision stays **visible**: the runtime guard in
`src/lib/session/distractors.ts` still refuses to put the pair on one card, and `/browse/1?q=hear`
still finds 听见. The uniqueness gate reads the parenthetical, so the two buttons still differ. Both
questions get their true answer.

**Never resolve one by moving both cards off the shared word.** That is not a resolution, it is
concealment: it hides the collision from the gate, tells the distractor guard the two words are
unrelated — so it starts offering one as a wrong answer for the other — and deletes the word from
the app's own search. It is what produced 听见 "to catch a sound" in loop 1 and 衬衣 "underclothes"
in loop 3, and gate 6 exists because nothing caught either.

`baseline-L{1..5}.json` are the glosses loop 1 authored, carried over unchanged apart from the 面1 /
面2 split and 为's prepositional sense. They are not privileged — replace one by moving it into your
own file and deleting it from the baseline.

## How the loop-2 collisions were settled

The 24 loop-2 authors worked in parallel and none deleted the baseline entry they replaced, so 427
ids arrived owned twice. All 427 were baseline-vs-batch — no two batch files ever claimed the same
id. Every one was resolved in the batch author's favour and the baseline entry deleted, because on
inspection the batch note always cited the specific level-mate, official POS or rendering problem
its wording was chosen against, while the baseline note was one of four generic templates
("Grammar word — CC-CEDICT can only describe it, not gloss it", "Near-synonym — split from its
level-mate", …). 119 of the pairs were identical anyway; the 308 that differed were read one by one
before the rule was applied.

Where two authors gave two _different_ words the same primary gloss, neither was simply deleted:
both cards were re-glossed so each carries the sense that actually distinguishes it, and the note on
each says what the other card owns (二/两, 没什么/没事儿, 你/您, 号/日, 或/或者, 力/实力, 叫/由,
刷/刷子, 假如/要, 出汗/汗, 赔/赔偿, 公告/启事, 忍/忍受, 餐饮/饮食, 期望/预期, 报答/回报, plus five
pairs separated only by a plural s: 体育/运动, 泪水/眼泪, 大脑/脑子, 年度/岁月, 深处/深度).

## How the loop-3 "or" collisions were settled

Teaching the splitter the word `or` exposed 38 same-level pairs whose _primary_ glosses answered to
the same English — the text on the answer button — so a learner could press a button reading
exactly what the prompt asked for and be marked wrong. `batch-25-or-collisions.json` holds the cards
whose two words really do mean different things; each note names the level-mate that owns the sense
it gave up (餐厅 → "a dining hall" because 餐馆 owns "restaurant", 鼠标 → "a computer mouse" because
鼠 is the animal). `batch-26-primary-senses.json` fixes the wrong primary senses left in the
machine-picked residue, plus 老百姓's truncated quotation and the 初 merge, which had been dropping
the lunar-date prefix sense (初一…初十) its second official row exists to carry.

## How loop 4 re-resolved the ones that were only hidden

Four of the loop-3 resolutions moved a card off a sense it genuinely owns — 衬衣 → "underclothes"
against a reference of `["shirt"]`, 该 → "to be one's turn" when 该 at HSK 2 is the modal, 法 off
"law", 植物 off "plant" — and 听见 "to catch a sound" had survived from loop 1. Gate 6 was written to
make that class visible: it fires on 205 cards today, and `scripts/gloss-survival-allow.json` clears
the ones that are ordinary synonym rewrites so the rest cannot hide among them.

`batch-27-qualified-senses.json` holds the 33 cards that came out of it. Eight collisions were
re-resolved by qualifying the shared sense on both sides (听见/听到, 看见/看到, 衬衫/衬衣,
可是/但是/但, 该/应该, 孩子/小朋友, 植物/种, 法/法律) — every one of those pairs still shares a sense,
which is the point. The rest are the wrong-for-level primaries the loop-3 verdict named, most of them
part-of-speech leads gate 4 could not see until it was widened: 最近, 近来, 原先, 一般, 频繁, 长寿,
黑暗, 幽默, 正版, 输入, 各地, 处于, 长处, 期中, 权利, 全体.
