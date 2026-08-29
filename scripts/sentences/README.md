# scripts/sentences/

Hand-authored example sentences, read by `scripts/build-vocab.mjs` and shipped as the optional
`example` field on `Word` (`src/lib/types.ts`).

A gloss says what a word means; a sentence shows how it is used, which is what both reference apps
spend their entry screen on. Nothing in the app may assume the field is there — HSK 3–5 have no
sentences yet, and those cards ship with **no `example` key at all** rather than an empty one.

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

Every one of these is also a test in `src/lib/data/vocab.spec.ts`, so a sentence hand-edited into
`src/lib/data/*.json` fails even if nobody re-runs the build.

## Coverage

| Level | Cards | Sentences |
| ----- | ----- | --------- |
| HSK 1 | 500   | 500       |
| HSK 2 | 770   | 770       |
| HSK 3 | 969   | —         |
| HSK 4 | 999   | —         |
| HSK 5 | 1,070 | —         |

Levels 3–5 are the open work. Note that the level gate gets easier as the level rises: an HSK 5
sentence may draw on all 1,500 characters.
