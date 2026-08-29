# reference/ — the bar

Everything a builder or critic is measured against. Load this folder before judging anything.

## `hsk/` — official HSK 3.0 (2021 standard, current for 2026) vocabulary, levels 1–5

`hsk30-official-L{1..5}.json` — **4,316 words**, the authoritative ground truth. Level membership,
pinyin, POS and traditional forms here are _not_ negotiable: an entry in the app that contradicts
these files is a failure, not a style note.

| Level | Words | Cumulative |
| ----- | ----- | ---------- |
| 1     | 500   | 500        |
| 2     | 772   | 1,272      |
| 3     | 973   | 2,245      |
| 4     | 1,000 | 3,245      |
| 5     | 1,071 | 4,316      |

These counts are the counts published in 《国际中文教育中文水平等级标准》 (International Chinese
Language Education Chinese Proficiency Grading Standard, GF 0025-2021) — the standard HSK 3.0 tests
against. A level whose count differs from this table is wrong.

### Provenance and verification

Two **independent** OCR extractions of the official standard were cross-checked against each other:

- `sources/ivankra-hsk30.csv` — extraction cross-referenced against the official
  `chinesetest.cn` word list (its `WebNo`/`WebPinyin` columns are the official site's index and
  pinyin). MIT.
- `sources/elkmovie-hsk30-wordlist.txt` — separate OCR of the standard, © 2021 Pleco Inc., MIT.

Result of the cross-check at levels 1–5, after normalising the part-of-speech annotations that only
one source carries:

```
L1: 500/500   identical sequence   0 differences
L2: 772/772                        2 words differ in notation only (称1/称¹, 面1/面²)
L3: 973/973   identical sequence   0 differences
L4: 1000/1000 identical sequence   0 differences
L5: 1071/1071                      1 word differs in notation only (称2/称²)
```

Word-for-word agreement **in order** at every level; the only residual differences are superscript
vs. ASCII digits used to disambiguate homographs. Treat the word sets as settled.

### Field notes

- `pinyin` — tone-marked, syllable-spaced, **no** tone sandhi applied (so 不 and 一 appear in their
  citation tone). Joining against other datasets is easier this way.
- `officialPinyin` — pinyin exactly as the official HSK site prints it: tone sandhi on 不/一 **is**
  applied, and separable verbs are marked with `∥` (e.g. 帮忙 `bāng∥máng`).
- `pos` — `/`-separated codes: `N V Adj Adv Pron Num M Prep Conj Aux Int Prefix Suffix Phonetic`.
- `simplified` may carry variant/disambiguation notation: `爸爸|爸` (variants), `有（一）点儿`
  (optional part), `第（第二）` (bound form with example), `称1`/`称2` (homographs). `variants` holds
  the cleaned expansion. **Do not render the raw notation to a learner.**
- `cedictDefs` — glosses joined from CC-CEDICT by exact `trad|simp[pinyin]` key (4,286 of 4,316 hit
  exactly). Reference material for writing learner-facing meanings, **not** shippable copy: CEDICT
  glosses are long, comma-piled and often register-wrong for a beginner. 30 entries have no gloss —
  mostly transparent compounds (车上, 不太, 送到).

Dictionary: CC-CEDICT, CC-BY-SA 4.0, published by MDBG —
`https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz`. Attribution is
required if its glosses are shipped.

## `screenshots/` — the visual bar

Real mobile UI from the two apps a learner already has on their phone. **Not** a mood board: these
are the products this one has to be opened instead of.

- `pleco/pleco-iphone-{01..05}.png` — raw device screenshots, 1242×2208, no marketing chrome.
  Note what Pleco does with a headword: enormous hanzi, tone-marked pinyin on its own line, the
  level badge (`HSK 3`), part of speech, then numbered senses with example sentences that carry
  hanzi + pinyin + English stacked. Dense, but every line earns its place.
- `duchinese/duchinese-iphone-{01..08}.png` — App Store frames (marketing headline + device).
- `duchinese/ui/*-ui.png` — the same shots cropped to the device viewport, so what you compare
  against is the actual product UI. Note the restraint: one red accent, generous whitespace,
  large friendly type, a three-item bottom tab bar, full-width primary buttons.
- `*-appstore-meta.json` — app name, version, rating and store description for each.

Sourced from the public iTunes lookup API at original resolution. Screenshots are the property of
Pleco Inc. and Sinamon AB respectively and are here as a design reference only.
