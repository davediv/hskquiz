# scripts/sentences/

Hand-authored example sentences, read by `scripts/build-vocab.mjs` and shipped as the optional
`example` field on `Word` (`src/lib/types.ts`).

A gloss says what a word means; a sentence shows how it is used, which is what both reference apps
spend their entry screen on. Every one of the 4,308 cards now carries one, but the field stays
optional on `Word`: nothing in the app may assume it is there, and a card without a sentence ships
with **no `example` key at all** rather than an empty one.

## The contract

One `.json` file per author, keyed by **card id**. File names and read order carry no meaning — the
build reads **every** `.json` here and merges them — so authors can work in parallel. The same id
appearing in two files is a **build failure**, not a last-writer-wins: one id, one sentence.

```json
{
	"L1-0001": {
		"hanzi": "我爱我的爸爸妈妈。",
		"pinyin": "wǒ ài wǒ de bà ba mā ma",
		"english": "I love my mum and dad."
	}
}
```

- `hanzi` — simplified, ending in `。`, `？` or `！`. Full-width punctuation only; the four marks
  in use are `。？！，`. No Latin letters, no digits, no notation.
- `pinyin` — tone-marked, **one whitespace-separated token per character**. Erhua is its own token,
  `wán r` and not `wánr`, because that is what the card's own `syllables` array says 玩儿 is.
  Punctuation is stripped by the build, so write it or don't — the shipped field never carries any,
  exactly like the headword's own `pinyin`.
- `english` — a natural translation, not a gloss-by-gloss crib.

## Gate (g) `example-level`

Every sentence has to clear all of this, or the build writes nothing:

1. **Level** — every character sits at or below the card's own level. The allowed set is derived
   from the shipped corpus, not from a separate list, so it cannot fall behind what the app
   teaches: 300 / 599 / 899 / 1200 / 1500 characters for HSK 1–5. An HSK 5 character in an HSK 1
   example does not teach the word in context, it swaps one unknown word for two.
2. **Alignment** — the pinyin's syllable count equals the sentence's character count, punctuation
   excluded. This is what lets a sentence be tone-coloured syllable by syllable the way a headword
   already is.
3. **Relevance** — the sentence contains the card's own `hanzi`. An example that never uses the
   word is not an example.
4. **Completeness** — no empty `hanzi`, `pinyin` or `english`, and no unexpected fields.
5. **Length** — at most 20 characters. Past that it stops being an example and becomes a text.
6. **Bookkeeping** — no duplicate id across files, and no sentence keyed to an id that is not a
   card. A merged homograph (老1/老2 are one card) takes one sentence, on the card's id.

## Gate (h) `example-shared`

7. **Uniqueness** — no two cards ship the same sentence, and no two ship the same English for
   one. Writing a word's example around a neighbouring word is the natural way to write one —
   关 and 关上 both got "走的时候请关上门。" — and it is exactly the pair the distractor picker
   is most likely to put on one card, which leaves the learner two buttons with one sentence
   behind them. A shared English is the same defect one layer down.

   Near-synonyms are the cards that most _need_ separate sentences, not the ones that excuse a
   shared one. 关 now shows the plain verb ("请关门，外面很冷。") and 关上 the resultative
   ("她关上门就走了。"), which is the distinction a learner is actually there for.

Every one of these is also a test in `src/lib/data/vocab.spec.ts`, so a sentence hand-edited into
`src/lib/data/*.json` fails even if nobody re-runs the build.

## Coverage

| Level | Cards | Sentences |
| ----- | ----- | --------- |
| HSK 1 | 500   | 500       |
| HSK 2 | 770   | 770       |
| HSK 3 | 969   | 969       |
| HSK 4 | 999   | 999       |
| HSK 5 | 1,070 | 1,070     |

Complete. Note that the level gate gets easier as the level rises: an HSK 5 sentence may draw on
all 1,500 characters, so a sentence for an abstract HSK 5 word has no excuse to be written in a
beginner frame — write it in the register the word actually belongs to.
