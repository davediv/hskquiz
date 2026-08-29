# Verdict — design-system, loop 1

**PASS: no.** Two `fail`-severity findings reproduce exactly as reported, and the system's
signature feature is dead on most of the corpus.

Note on the blind judge (below): it preferred **our** screen over Pleco. That is real and I am not
manufacturing a deficit to offset it. But "better composed than Pleco's detail screen" and "the
Chinese is set correctly" are different claims, and the piece fails the second one.

---

## Surviving findings

### 1. FAIL — Tone colouring is dead on 71% of the vocabulary

`toneOf` in `src/lib/design/tone.ts` returns `null` for any token carrying two tone-marked vowels,
so every unspaced compound falls back to flat `ink-muted`. I re-ran the shipped function over the
shipped data and reproduced the critic's count to the word:

```
{ tot: 4307, full: 1220, none: 3049, part: 38, pctUncoloured: '70.8' }
spotcheck: ài=4 · àihào=(none) · bàba=(none) · báitiān=(none) · bàn nián=4,2
```

`bàn nián` colours only because that one row happens to carry a space; `báitiān` does not. 3,049 of
4,307 words get no tone colour at all. Visible in
`/Users/div/Desktop/project/hskquiz/progress/shots/loop-1/design-system-browse-mobile.png` —
爱 ài purple, 八 bā red, 白 bái green, but 爱好, 爸爸, 白天 all plain grey in the same list. This
reads as broken rendering, not as restraint.

The split is not actually ambiguous: `reference/hsk/hsk30-official-L1.json` carries `cedictKey` with
numbered per-syllable pinyin (`愛|爱[ai4]`, `爸爸|爸爸[ba4 ba5]`) on **499 of 500** L1 entries.
The docstring's premise — that splitting is unsafe — is true only because the build throws the
unambiguous data away.

### 2. FAIL — Shipped word counts contradict `reference/hsk` ground truth

Counted directly:

| Level | app | official | short |
| --- | --- | --- | --- |
| 1 | 500 | 500 | — |
| 2 | 769 | 772 | 3 |
| 3 | 969 | 973 | 4 |
| 4 | 999 | 1000 | 1 |
| 5 | 1070 | 1071 | 1 |

Total 4,307 vs 4,316 — 9 words missing, and the hero prints the wrong number as fact in
`design-system-mobile.png` / `design-system-desktop.png` ("4,307 words, five levels").
`reference/README.md`: "A level whose count differs from this table is wrong."

### 3. MAJOR — Red means both "pinyin" and "wrong"

`src/routes/layout.css:278` sets `--color-wrong: var(--hq-accent)` (#c8102e), and
`src/lib/components/quiz/QuestionPrompt.svelte:218` sets the headword pinyin in
`var(--color-accent)` — the same red. In
`/Users/div/Desktop/project/hskquiz/progress/shots/loop-1/design-system-answered-mobile.png` the
eyebrow reads green ✓ CORRECT and the chosen option is green, while `zěnme` sits under 怎么 in
error red. In `design-system-wrong-mobile.png` four unrelated things wear that identical red at
once. The file's own header warns against exactly this.

### 4. MAJOR — The stated reference is inverted

`tone.ts` says "Pleco colours pinyin by tone"; Pleco colours the **hanzi** and leaves pinyin black
(`reference/screenshots/pleco/pleco-iphone-02.png`: 几乎 in red hanzi, "PY jīhū" in plain black;
`pleco-iphone-01.png`: 手机 blue+red, 收集 red+green). `layout.css` then forbids the one placement
that needs no guessing at all — one character is exactly one syllable — with "use it on pinyin,
never on the hanzi itself."

### 5. MAJOR — Data-driven pinyin is never syllable-spaced

The only spaced pinyin in the product is hand-written copy: `cí huì liàn xí` in the home hero
(`design-system-mobile.png`). Every data-driven surface glues syllables —
`nǚpéngyou` at 5× in `design-system-zoom-nv.png`, `bàba`/`báitiān` in `design-system-zoom-rows.png`.
Only 66 of 500 L1 rows carry a space. Du Chinese spaces and colour-matches
(`reference/screenshots/duchinese/ui/duchinese-iphone-04-ui.png`).

### 6. MAJOR (new — from the blind judge, verified) — Eliminated options fail contrast

`src/lib/components/quiz/ChoiceButton.svelte:158` dims non-chosen options with `opacity: 0.42`.
Sampled off `design-system-answered-mobile.png`, the "those" glyphs land at rgb(155,154,150) on
rgb(252,251,249) — **2.72:1**, under 3:1 and well under 4.5:1 for body text. The blind judge
flagged this independently ("likely below 3:1"); it measures worse than it guessed. These rows are
still the learner's record of what they rejected, not decoration.

### 7. MINOR — Dead type token, missing vertical scale

`--text-hanzi-2xl` (88px) has no consumer in `src/` outside the `Hanzi.svelte` lookup table. The
system defines 8 Latin + 8 hanzi + 5 pinyin steps and **no** spacing scale (`grep` for `--space`
in `layout.css` returns nothing), so screens improvise gaps — hence the ~250px void between
"pronoun" and the first option in `design-system-hanziprompt-mobile.png` and
`design-system-answered-mobile.png`. The blind judge saw the same hole from the other side
("~90pt dead band … leaves the composition bottom-heavy").

### 8. MINOR — The font-stack guarantee is untested

The "pinyin stack never falls through" claim verifies on this machine (identical advance widths for
the full stack vs `'PingFang SC'` alone; no mid-word swap at 5× in `design-system-zoom-nv.png`),
but `src/lib/design/` holds no spec asserting it, and the non-CJK tail is what a Windows/Linux
learner actually gets. Tone contrast, by contrast, is genuinely solid — worst ratio 4.52:1, all
five tones clear 4.5:1 in both themes.

---

## Blind judge

Preferred **B — ours** — over Pleco, gap "moderate"
(`progress/blind/loop-1/design-system/mapping.json`: A = `pleco-iphone-02.png`,
B = `design-system-answered-mobile.png`).

It praised our four-step type ramp, character presence (~22% of screen width per glyph vs Pleco's
~7%), four-value colour discipline, consistent gutter and ~50pt tap targets, and marked Pleco down
for six jobs on one system blue, three left edges, and sub-44pt controls. **Its
`whatWeakerMustChange` list is addressed to Pleco and is not an instruction to us** — do not action
it.

What it said against *ours* is the part that binds, and three of four are already findings above:
the dead band (#7), the sub-3:1 dimmed option text (#6), hairline option borders that read as no
border, and — unprompted, without knowing what the piece was called — *"the pinyin is a single flat
crimson where tone colouring would have earned its keep."* An independent judge landed on the same
defect as the critic from pure composition.

---

## Biggest gap

**Move tone from a render-time guess to build-time data, and render every syllable from it.**

In `scripts/build-vocab.mjs`, parse the numbered pinyin out of each reference row's `cedictKey`
(`愛|爱[ai4]` → `[{p:'ài',tone:4}]`; `爸爸|爸爸[ba4 ba5]` → `[{p:'bà',tone:4},{p:'ba',tone:5}]`)
and write a `syllables` array onto every `Word`, aligned 1:1 with the characters of `hanzi`. Fail
the build loudly on any row where the syllable count and character count disagree, or where
`cedictKey` is absent — do not silently fall back.

Then make `src/lib/design/Pinyin.svelte` render from `syllables`: space-separated and tone-coloured
on all 4,316 words, not the 29% that happen to be monosyllabic. Let `Hanzi.svelte` colour each
character from the same array, the way Pleco and Du Chinese both actually do. This retires the
accent-red pinyin in `QuestionPrompt.svelte:218` as a side effect — the same text cannot be both
tone-coloured and accent-red — which hands red back to meaning only "wrong".

`toneOf`'s guessing path stops being load-bearing and becomes a fallback that nothing reaches.
