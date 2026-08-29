# vocab-browse — loop 1 verdict

**Result: FAIL.** The screen is the best-designed thing in the repo and it beat Pleco in a blind
comparison — but two of its three information features (tone colour, pinyin search) are broken on
the majority of rows by a single shared cause, and both are broken in a way the learner reads as a
bug rather than a limit.

## Blind design judge: we won, decisively

`progress/blind/loop-1/vocab-browse/mapping.json` — **A was ours** (`vocab-browse-mobile.png`), B was
the Pleco reference (`reference/screenshots/pleco/pleco-iphone-01.png`). The judge picked **A**, gap
**large**: *"A is a designed screen; B is a stock iOS table view."* It praised the three-tier type
scale, the shared baselines, the ~51pt row rhythm, the warm paper ground, and that we confine tone
colour to the pinyin while Pleco rainbows the hanzi itself and damages shape recognition.

**The `whatWeakerMustChange` list is addressed to Pleco, not to us. Do not action it.** There is no
design deficit to close here, and none should be manufactured. Carry forward only the four asides
the judge aimed at A, listed as F9 below.

The judge saw a static first screen with no query typed and no progress seeded. Everything that
follows is what breaks once the screen is used.

## Surviving findings

### F1 — FAIL — Tone colour fires on 28.3% of rows; the pattern is invisible to a learner
Independently recounted over `src/lib/data/hsk{1..5}.json`: **1,220 of 4,307 rows** have every token
coloured. `toneOf()` returns `null` on any token carrying two tone marks, and **3,043 words** ship
unspaced multi-syllable pinyin. In `vocab-browse-mobile.png`, 爱 ài is purple and 爱好 àihào directly
beneath it is grey; 白 bái green, 白天 báitiān grey; 八 bā red, 爸爸 bàba grey. Nothing on screen
explains the difference, so the colour reads as a rendering fault. In
`vocab-browse-l5-search-hao-mobile.png` the one coloured row of eight is 稍 shāo — the only result
that is *not* a hào word, so the colour points at the wrong row. It reaches the sheet too:
`vocab-browse-sheet-mobile.png` renders àihào flat grey at 28px, where tone colour is worth most.

The justification in `src/lib/design/tone.ts` ("splitting an unspaced string into syllables is
genuinely ambiguous") does not survive contact with this corpus — see Biggest gap for the counts.

### F2 — FAIL — Pinyin search matches inside syllables and across digraphs; junk outranks hits
Reproduced against the shipped data with `search.ts`'s own scoring. `/browse/5`, query **"hao"**: 15
matches, **超越 chāoyuè ranked #3** — above 称号 chēnghào (#4) and 口号 kǒuhào (#7), which actually
contain hào — alongside 驾照, 稍, 稍微, 招生. Query **"an"**: **434 matches, 41% of the level**,
because "bàifǎng", "bǎn", "bànyǎn", "bàng" all contain the letters a-n. Screenshot:
`vocab-browse-l5-search-hao-mobile.png`. Same root cause as F1: 称号 indexes as tight `chenghao` with
no space, so the syllable-aligned band (`entry.pinyin.includes(' hao')`, score 4) never fires and the
true hit drops to the `tight.includes` band (6) — tied with chāoyuè, broken by list order. Pleco
returns exactly the shǒujī words for "shouji".

### F3 — MAJOR — Status-chip strip clips mid-word at 375px with no scroll affordance
Measured live: strip clientWidth 335, scrollWidth 488. Chip right edges All 102 / New 189 /
Learning 302 / Shaky 391 / **Mastered 508**. `vocab-browse-chips-mobile.png` shows "Shaky" sliced
through the word with its pill border cut and "Mastered 120" entirely absent. `StatusFilter.svelte`
hides the scrollbar (`scrollbar-width:none`, `::-webkit-scrollbar{display:none}`) with no fade mask,
gradient or chevron — nothing signals the filter exists. Its own comment says *"show me the 14 I keep
missing… is the reason to open this screen"*, and that is the chip being cut in half.

### F4 — MAJOR — Row text ghosts through the app bar and sticky controls on every scroll
`vocab-browse-l5-deep-mobile.png` at scrollY 68400: "ADV. one breath, in one breath" is legible
through the header in the descender zone of "HSK 5 vocabulary"; "…of consciousness" ghosts behind the
"New 1,070" chip. Bar computes to `color(srgb 0.98 0.972 0.96 / 0.82)` with `saturate(1.6) blur(14px)`
— too transparent and too weakly blurred for 14px Latin at 2× DPR. Both references use opaque chrome
(`pleco-iphone-01.png`, `duchinese-iphone-07-ui.png`).

### F5 — MAJOR — The word sheet is materially thinner than the Pleco entry it cites
`vocab-browse-sheet-mobile.png` (爱好): hanzi, traditional, pinyin, "VERB · NOUN", two glosses, a
status line, Practise — then it ends. `reference/screenshots/pleco/pleco-iphone-02.png` for the same
class of word gives four example sentences as hanzi + pinyin + English, an HSK badge in the headword
block, per-line audio, and CHARS / WORDS / SENTS tabs. We have no example sentence, no per-character
breakdown, no audio, and the right half of the headword block is empty where Pleco puts the badge.
This is where "open this instead of Pleco" is decided.

### F6 — MINOR — Header word counts contradict the standard the footer names
Shipped vs `reference/hsk/hsk30-official-L{n}.json`, recounted: L1 500/500, **L2 769/772, L3 969/973,
L4 999/1000, L5 1070/1071**. `/browse/5` prints "1,070 words" (`vocab-browse-l5-mobile.png`).
`reference/README.md`: *"A level whose count differs from this table is wrong."* Collapsing 称1/称2 and
有（一）点儿 into single cards is defensible card design, but the headline number must not disagree with
the standard cited in our own footer.

### F7 — MINOR — A fast fling can render a fully blank page
`virtual.ts` sets `DEFAULT_OVERSCAN = 3` — 228px at the measured 76px row — on an rAF-throttled
scroll handler, so any frame travelling further renders nothing. Reproduced as a blank cream screen
(`vocab-browse-l5-fling-mobile.png`) with 8 × 2400px wheel events in one task. At one event per 16ms
it holds. Tail case, not the common one; windowing at rest is correct (scrollY 68400 → indices
894–911, list ends at index 1069 遵守 zūnshǒu, document height 81,722px).

### F8 — MINOR — 9.0% of rows have no POS chip; some glosses are not learner copy
Recounted: **386 of 4,307** words ship an empty `pos` array, so the gloss column has a ragged left
edge — 半年, 半天, 帮忙 flush left against indented 爱, 八, 白 in `vocab-browse-desktop.png`; also 岸上
(`vocab-browse-l5-mobile.png`) and 搞好. On the first screen of `/browse/5`: 白酒 báijiǔ is "white
wine" (a distilled grain spirit — a CEDICT carry-over), 版 bǎn is "a register, block of printing";
on `/browse/1`, 包子 bāozi is glossed "baozi", which is not a gloss.

### F9 — MINOR — The four asides the blind judge aimed at our own screen
Tone hues read as unturned web primaries against the warm paper ground; tone-1 red collides in
meaning with the red Practise action; the dotted status ring is ~24pt and sub-thumb if tappable; POS
casing is inconsistent ("v." vs "NUM."). Refinements on a system the judge called coherent — do these
after F1–F5.

## Biggest gap

**Segment every word's pinyin into syllables at build time in `scripts/build-vocab.mjs`, ship a
`syllables: string[]` field on each `Word`, and make `Pinyin.svelte` and `search.ts` read that field
instead of inferring syllables from whitespace.**

One change kills both FAIL findings. I verified the segmentation is tractable on the real corpus,
using the ~400-syllable inventory already sitting in `src/lib/design/tone.ts` and constraining the
split to the word's hanzi character count:

- **3,043** words need splitting; **3,028 resolve to exactly one valid segmentation** — no heuristic,
  no dictionary, just the count constraint against the inventory we already ship.
- **10** are genuinely ambiguous and go in a hand-written override table you can review in one
  sitting: 可能 kěnéng, 西南 xīnán, 热闹 rènao, 身高 shēngāo, 严格 yángé, 转告 zhuǎngào, 大脑 dànǎo,
  蛋糕 dàngāo, 技能 jìnéng, 敏感 mǐngǎn.
- **5** yield zero segmentations only because `tone.ts`'s `SEPARATORS` (`/[\s'’·∥]+/u`) omits the
  hyphen that `search.ts`'s own separator regex already includes: 青少年 qīng-shàonián, 一路顺风
  yílù-shùnfēng, 中小学 zhōng-xiǎoxué, 五颜六色 wǔyán-liùsè, 酸甜苦辣 suān-tián-kǔ-là. Split on the
  hyphen first, then segment each part. Unify the two regexes while you are there.

So the ambiguity the module header invokes to justify greying 71% of rows is **ten words**.

Then: tone colour goes from 28.3% to 100%, and 爱好 àihào is coloured exactly like 爱 ài. Search
regains a real syllable-aligned band keyed off `syllables` rather than `includes(' hao')`, so "hao"
on HSK 5 puts 称号 and 口号 above 超越, and "an" stops returning 434 of 1,070 words.

**Fail the build if any word's segmentation length disagrees with its hanzi character count**, so the
invariant cannot rot as data changes.
