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

A gloss has to clear four build-failing gates, all of them also tests in
`src/lib/data/vocab.spec.ts`:

1. **Register** — no slang, sexual, vulgar, dialect, figurative or variant-character content.
2. **Cross-level** — two levels of the same word may not lead with the same gloss (白, 才, 牛, 火,
   头, 称, 好, 多, 一会儿, 出口).
3. **Romanization** — a gloss may not be the word's own toneless pinyin (包子 is not "baozi").
4. **Part of speech** — an N/Adj/Adv-only card may not lead with `to …`, and a V-only card may not
   lead with a bare noun.

Two more, on top of the gates: within a level no two cards may share a primary gloss, and no two may
share a whole meaning _set_. Both compare on the article-stripped normalisation that
`senseSet()` in `src/lib/session/distractors.ts` uses, so "a crowd" and "crowd" are the same answer.

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
