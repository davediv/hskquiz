# Loop 4 — design-system

**Verdict: FAIL.** The blind judge preferred our screen over Pleco by a large margin, and both
loop-3 colour findings are closed — but the system prints the wrong pinyin orthography on 72% of
the shipped corpus, which is the one thing a Chinese-typography design system exists to get right.
A screen can be better composed than the reference and still be spelling words wrong.

## Blind judge — we won, and it was not close

`progress/blind/loop-4/design-system/mapping.json`: **A = Pleco reference, B = ours**
(`progress/shots/loop-4/design-system-browse-mobile.png`). The judge picked **B**, gap **large**,
and its entire `whatWeakerMustChange` list is an instruction to *Pleco*, not to us. Do not treat
that list as work.

It named as decisive exactly the call this system made deliberately: "B keeps every hanzi in a
single near-black ink at 28pt regular and puts tone colour only on the pinyin, at reduced
saturation. The character is the noun, the colour is the annotation." It also credited the four-tier
ramp (28/15/13/10pt), the composed header, the inset row rules, the ~50pt pitch, the fixed POS
column, the per-row status ring, and the warm paper ground — every one of them a loop-1-to-3 fix
that has now been validated by someone who did not know whose screen it was.

Its three faults for us are real and new: the control tier is undersized at 33–40pt where it
should be 44 (level segments, search field, chips); the dashed status ring is ~14pt and unusable
as a target if tappable; and the two chips both reading "969 All / 969 New" makes the pair look
broken.

## Surviving findings

### FAIL — `<Pinyin spaced>` defaults to the wrong orthography, on 72% of the corpus
`src/lib/design/Pinyin.svelte:66` ships `spaced = true`, which splits correctly-joined pinyin into
one space-separated syllable per hanzi. I re-measured the shipped JSON: **3,107 of 4,308 words
(72.1%)** store a joined multi-syllable pinyin the default renders split — 爱好 `àihào`, 白天
`báitiān`, 杯子 `bēizi`, and proper nouns (北京 `Běijīng` → `Běi jīng`). `officialGaps()` at
Pinyin.svelte:94 does this correctly and is reached **only** when `spaced={false}`, which exactly
two call sites in the repo pass (`+page.svelte:148-149`, `LevelCard.svelte:266`). All 14 others
take the split default, including `WordRow.svelte:56`, which paints every one of the 4,308 browse
rows. The app's own masthead comment at `+page.svelte:135-137` states the rule and condemns what
every other screen does: "cíhuì liànxí is right, cí huì liàn xí (spaced) and cíhuìliànxí are both
wrong." Shots: `design-system-browse-mobile.png` (`ài xīn`, `ān pái`, `bǎ wò` split) against
`design-system-mobile.png` (`xièxie`, `chāoshì`, `zhōumò` joined) — adjacent screens, contradictory
spelling. Pleco joins: `reference/screenshots/pleco/pleco-iphone-01.png`.

### MAJOR — sentence pinyin is in no orthography at all
Atomised per syllable, no sentence-initial capital, no terminal punctuation, while the hanzi line
above carries 。 and the English below carries a full stop. `design-system-quiz-desktop.png`:
`wǒ de māo shì hēi sè de`. `design-system-quiz-mobile.png`: `bié zài jiào shì lǐ dà shēng hǎn`.
`design-system-dark-quiz-mobile.png`: `tā zài wài bian gàn huór`. Source: `QuestionPrompt.svelte:335`
and `WordCard.svelte:226`. Pleco sets the same three-line stack as `Tā jīhū yī yè méi shuì.`
(`pleco-iphone-02.png`). Flipping `spaced` fixes the word gaps but not the casing or the period.

### MAJOR — the loop-3 gap was closed by writing the ratchet loose, not by deciding
`scale.spec.ts` is real, well-built, 46/46 green, and rule 2 genuinely killed `--text-hanzi-2xl`
and `--text-hanzi-prompt`. But `OFF_RAMP_CEILING = 140` (scale.spec.ts:135) sits above the 134
literals I measured with the spec's own regexes across 21 files (17 QuestionPrompt, 15 WordCard,
14 WordSheet, 13 SessionSummary, 12 ReviewDrill), and `UNADOPTED` (:377-389) allowlists the 14
names including the two the loop-3 verdict told the builder to adopt. `grep 'class="[^"]*stack'`
still returns **0**, fourth loop running; `app-shell` appears as a class attribute **0** times.
Six units of slack over a debt no one is required to pay.

### MINOR — three horizontal axes on the quiz screen
`design-system-quiz-mobile.png` at 375px: `1/10` and its track flush left at the 20px gutter; the
hanzi/pinyin/gloss stack centred on 187px; the Listen pill at x≈278–355 hard against the right
gutter, on the pinyin's own baseline. Same three axes at 1440px in `design-system-quiz-desktop.png`.

### MINOR — five hues carry meaning, no key anywhere
Contrast and hue separation both PASS now (light 5.12–6.53:1 on page, min pairwise ΔE00 20.4, up
from 13.9). The remaining complaint is only that nothing names the mapping: `grep -niE 'legend|tone key'`
finds only `SessionSummary.svelte:661`, a comment describing a legend that was removed.
**Contested, and I side with the judge**: it praised painting tone into the pinyin as the decisive
win over Pleco. Add a key; do not move the channel.

### MINOR — desktop is the mobile column widened
`design-system-desktop.png` at 1440×900: the 3+2 grid still leaves an empty cell beside HSK 5 and
the rail ends at ~48% height. `design-system-quiz-desktop.png`: one ~503px column in 1440px.

### MINOR — POS column sized for the short labels
`design-system-browse-mobile.png`: `N.` ends at x≈36 and the gloss begins at x≈66; `PREP.` ends at
x≈63 against the same x≈66. Collapses on every preposition and measure-word row. Same in
`design-system-dark-browse-mobile.png`.

### MINOR — one pairing clears AA by two hundredths
Recomputed from the shipped hex: `--hq-ink-subtle #726b5f` on `--hq-surface-sunken #f1ede6` =
**4.52:1** (vs 4.97 on page). It is the pinyin line inside the sunken SENTENCE card at 14px in
`design-system-quiz-mobile.png`. The dark ramp has no equivalent problem. One hex nudge.

## Biggest gap

**Flip `spaced` to default `false` in `src/lib/design/Pinyin.svelte:66` and audit all 16 call
sites, so the component prints the orthography the data already ships.** Per-syllable spacing must
survive at exactly the two ruby-aligned sites where pinyin sits above individual characters
(`CharacterCard.svelte:75`, `QuestionPrompt.svelte:345`); every word-level site —
`WordRow.svelte:56`, `QuestionPrompt.svelte:268`, `WordCard.svelte:210`, `WordSheet.svelte:483`,
`ReviewDrill.svelte:227`, `ResultsFallback.svelte:62/77`, `SessionSummary.svelte:426/458`,
`CharacterCard.svelte:115`, `browse/[level]/+page.svelte:598` — must print `chāoshì`, not
`chāo shì`. `officialGaps()` already computes this correctly and preserves the 135 words that
carry a real word-internal space (`bú kèqì`, `huí lái`) and the 36 erhua endings. Sentence sites
(`QuestionPrompt.svelte:335`, `WordCard.svelte:226`) come along for the ride and additionally need
the leading capital and the terminal period, so `wǒ de māo shì hēi sè de` sets as
`Wǒ de māo shì hēisè de.` Then delete the two `spaced={false}` overrides that exist only to work
around the bad default, and land a `pinyin.spec.ts` assertion that no rendered `Word.pinyin` ever
contains more word-gaps than its source string — otherwise this silently regresses the moment
someone adds a call site, exactly the way the spacing scale did for three loops.
