# Loop 5 — design-system

**Verdict: FAIL.** The layout, scale and colour discipline are now genuinely reference-grade — an
independent blind judge picked this system over Pleco by a large margin. It fails on one thing:
the pinyin orthography this system puts on its own masthead is contradicted by 100% of the
sentences it renders.

## Blind judge

A = reference (`reference/screenshots/pleco/pleco-iphone-02.png`), B = ours
(`progress/shots/loop-5/design-system-quiz-mobile.png`) — per
`progress/blind/loop-5/design-system/mapping.json`.

**The judge preferred OURS, gap "large".** Verbatim: *"B is a screen someone decided; A is a screen
someone assembled from platform defaults."* It credited a real type scale (≈6:1 hero-to-gloss vs
the reference's 2:1), a committed two-hue palette against the reference's five, a centred axis with
the sentence pulled into its own tinted object, and one unambiguous primary action. Its
`whatWeakerMustChange` list is addressed to **Pleco, not to us** — do not action it.

Its criticism of *our* screen is short, and its first item is the same defect the critic found
independently: *"The sentence-card pinyin is set syllable-by-syllable ("Rú guǒ míng tiān") where the
headword pinyin is correctly set as a word ("rúguǒ") — an inconsistency inside one screen."*
Two judges, no contact, same finding. That settles the ranking below.

## Surviving findings

### 1. FAIL — every sentence on every screen is in no orthography at all

Verified against the shipped data, not inferred:

- **4,308 / 4,308** examples are fully atomised — syllable count equals hanzi count, i.e. one gap
  per character, zero word grouping.
- **479 / 479** sentences whose hanzi carries `，` drop the comma entirely from the pinyin.

`progress/shots/loop-5/design-system-answered-mobile.png` is the kill shot: `夏天` is set
`xiàtiān` in the headword line and `Xià tiān` in the SENTENCE card 25 CSS-px below it — the same
word, two spellings, one viewport — and `夏天到了，天气越来越热。` renders as
`Xià tiān dào le tiān qì yuè lái yuè rè.` with the comma gone. Same defect in
`design-system-quiz-mobile.png` (`Rú guǒ míng tiān xià yǔ wǒ jiù bú qù le.`),
`design-system-summary-mobile.png`, and `design-system-dark-quiz-mobile.png`
(`wǒ men` for 我们).

The word-level half of the loop-4 MAJOR **did** land — 3,107 of 3,372 multi-syllable headwords now
carry joined spelling, and `/browse/1` preserves the apostrophe in `nǚ'ér`. So the segmentation
machinery exists and works. It was simply never pointed at `example.pinyin`.

Root cause is the **data**, not the component. `src/lib/data/hsk2.json` stores
`example.pinyin: "rú guǒ míng tiān xià yǔ wǒ jiù bú qù le"`; `Pinyin.svelte` prints the source
faithfully. Pleco sets the identical construct as
`Wǒ zài wùlǐxué fāngmiàn de zhīshi, jīhū děngyú líng.` — words joined, comma kept.

### 2. MAJOR — the regression guard cements the regression

`src/lib/design/pinyin.spec.ts:141-149` asserts the rendered spans re-concatenate to
`example.pinyin` character for character. That is a **fidelity** assertion, not an **orthography**
assertion: it goes green precisely *because* the renderer reproduces a misspelled string, and it
cannot fail no matter how the build spells the sentence. `npx vitest run src/lib/design` → 5 files,
61 tests, all passing, while 100% of on-screen sentences are wrong. The loop-4 verdict asked for a
guard; the guard was built pointing at the renderer, which was never the thing that could drift,
and left the source unmeasured.

### 3. MINOR — the atomised spelling causes a ragging defect
`design-system-dark-quiz-mobile.png`: the sentence is ~30% wider than the joined spelling and breaks
after `bú`, orphaning a centred `qù le.` on line 2 inside the card. Disappears with the fix above.

### 4. MINOR — three competing horizontal axes on the quiz screen, unchanged in two loops
`design-system-quiz-mobile.png` at 375px: `1/10` and its track flush left at the 20px gutter; the
152px hanzi stack centred on 187; the Listen pill at x≈278–355 hard against the right gutter,
sharing the pinyin's exact baseline so the pinyin reads as shoved left. Identical at 1440px in
`design-system-quiz-desktop.png`. The blind judge flagged this one too, unprompted.

### 5. MINOR — a ~110px void with nothing to justify it
Visible in `design-system-answered-mobile.png` between `noun` and the SENTENCE card. No other gap in
the design is near that size. Also flagged by the blind judge, along with the `Got it` pill at
~45pt where 52–56pt is the right target.

### 6. MINOR — browse filter chips print identical numbers
`design-system-browse-mobile.png` and `design-system-dark-browse-mobile.png`: `969 All` beside
`969 New`, with `969 words` in the header — the same number three times in a 120px band, so the pair
reads as broken. Called out by loop 4's blind judge; unchanged.

### 7. MINOR — level counts contradict reference ground truth on 4 of 5 levels
L1 500/500 ok; L2 770 vs 772; L3 969 vs 973; L4 999 vs 1000; L5 1070 vs 1071. Rendered in this
system's type on `design-system-desktop.png` (`0 of 770 practised`) and
`design-system-browse-mobile.png` (`969 words`). `reference/README.md`: *"A level whose count
differs from this table is wrong."*

### 8. MINOR — one dead token left, fifth loop
`grep -rn 'class="[^"]*\bstack' src --include='*.svelte'` → 0, fourth consecutive loop. `app-shell`
went 0 → 3, so the shell alias did get adopted; `stack` is now an isolated orphan rather than a
systemic gap. Three `spaced={false}` overrides still survive at `LevelCard.svelte:275` and
`+page.svelte:161-162` although `false` is the default — loop 4 asked for their deletion.

## Biggest gap

**Fix the sentence orthography at the SOURCE, in `scripts/build-vocab.mjs`, so all 4,308
`example.pinyin` strings carry the same word-level spelling and punctuation their hanzi already
carries.** `夏天到了，天气越来越热。` must build to `Xiàtiān dào le, tiānqì yuè lái yuè rè.`, not
today's `Xià tiān dào le tiān qì yuè lái yuè rè.` Segment each sentence with the **same word
boundaries the build already derives for `Word.pinyin`** — the 3,107 joined headwords prove that
machinery works, so reuse it rather than writing a second segmenter — and map each `。？！，、` in
`example.hanzi` to its Latin equivalent at the matching position in the pinyin so the 479 comma
sentences stop dropping it.

Then rewrite `src/lib/design/pinyin.spec.ts:141-149` from a fidelity assertion into an **orthography**
assertion: for every example, `pinyin.split(/\s+/).length` must be strictly fewer than its hanzi
count, and the count of `,` in the pinyin must equal the count of `，` in the hanzi. The current
test passes by faithfully reproducing the misspelling, and is the single reason this survived a loop.

Ship it with the one-screen proof: re-shoot `/quiz/2` at 375px and show `夏天` reading `xiàtiān` in
the headword and `Xiàtiān` in the sentence 25px below it — one word, one spelling, one screen.
