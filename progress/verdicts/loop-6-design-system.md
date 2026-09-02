# Loop 6 — design-system

**Verdict: FAIL.** The loop-5 biggest gap landed — sentences are now word-grouped and keep their
punctuation (`Míngtiān wǒ yào qù kàn yīshēng.`, `Tā shì yí wèi yǒumíng de huàjiā.`), and a second
blind judge again ranked this system above the reference by a large margin. It fails on one
measurable thing: the system owns a `>= 3:1` border token, proves it clears 3:1 in a test, and then
does not use it on the controls that most need it.

## Blind judge

A = reference (`reference/screenshots/pleco/pleco-iphone-02.png`), B = ours
(`progress/shots/loop-6/design-system-quiz-mobile.png`) — per
`progress/blind/loop-6/design-system/mapping.json`.

**The judge preferred OURS, gap "large"** — second consecutive loop, same pairing, same result.
Verbatim: *"B reads as a designed screen; A reads as reference software with system defaults… A has
not yet made a first decision."* It credited a real ~6:1 type scale, a disciplined palette (paper,
ink, one warm grey, one accent used exactly once), the sentence pulled into its own tinted object,
and one unmistakable thumb-sized primary action.

Its 11-item `whatWeakerMustChange` list is addressed to **Pleco, not to us — do not action it.**
Its criticism of *our* screen is three lines, and item one is this loop's headline finding:
*"the white 'Listen' pill sits outside the palette and breaks the centred axis."* It also named the
gaps below the character (~30/25/20pt, off a strict 4pt step) and *"the target word in the sentence
is marked by weight while pinyin is marked by hue, which is two systems for one idea."*

## Surviving findings

### 1. MAJOR — the on-page control edge is 1.23:1, and the fix is a token this system already ships

Verified in source, not just probed. `--hq-line` is `#e7e1d7` on a `#faf8f5` page (**1.23:1**) and
`#2e2a24` on a `#100f0e` page (**1.34:1**), against the 3:1 WCAG 1.4.11 floor for a UI-component
boundary. The fill behind it contributes nothing — `#ffffff` on `#faf8f5` is 1.03:1, `#191714` on
`#100f0e` is 1.25:1 — and `--shadow-card` is invisible on near-black. Yet this is the border on:

- `src/routes/layout.css:790` — `.card`, which `.hskq-card` and the summary's `.card word` inherit
- `src/lib/components/summary/SpeakButton.svelte:58` — `.say`, the **Listen** pill on quiz + summary
- `src/lib/components/summary/WordCard.svelte:350` — `.tool`, the **Entry** pill

`--hq-line-strong` measures 3.37 light / 3.86 dark and is already the border on the choice buttons
(`ChoiceButton.svelte:136`), the browse search field (`SearchField.svelte:127`), `.btn-quiet`
(`layout.css:845`) and the featured card (`LevelCard.svelte:304`). So this is an **inconsistency
inside one system**, not a missing token.

Evidence: `progress/shots/loop-6/design-system-dark-summary-mobile.png` is the kill shot — the
`10 more` button at the foot reads as a button at 3.86:1 while **Entry** and **Listen** eight rows
above it are ghost outlines at 1.34:1, all three the same 44px pill shape.
`progress/shots/loop-6/design-system-desktop.png` shows the light-mode version of the same
inversion: the HSK 2–5 cards are drawn *fainter than the ghost `Practise` buttons inside them*, so
each container is quieter than its own contents, while HSK 1's card is a clear rule.
`progress/shots/loop-6/design-system-dark-mobile.png` shows the HSK 1 / HSK 2 pair.

One correction to the critic: at 1x the level cards do not vanish — surface fill plus a faint edge
still reads as a card. The claim that four of five "read as unbounded text on black" is overstated.
The **pills** are the genuine 1.4.11 failure; the cards are the consistency failure.

`src/lib/design/palette.spec.ts:142` asserts `--color-line-strong` clears 3:1 on every surface — and
passes — while nothing asserts any control *uses* it. That is loop 5's lesson repeating exactly: a
guard aimed at the thing that could not drift, leaving the thing that did unmeasured.

### 2. MINOR — one white pill outside the palette, on the wrong axis

`progress/shots/loop-6/design-system-quiz-mobile.png` at 375px: `1/10` and its track flush left at
the 20px gutter, 家 centred on 187, the Listen pill at x≈278–355 hard against the right gutter on the
pinyin's exact baseline, so centred `jiā` reads as shoved left. Its fill is `--color-surface`
(`#ffffff`) on the `#faf8f5` page — the only pure white on the screen. Identical at 1440px in
`design-system-quiz-desktop.png`. Named in the loop-4 and loop-5 verdicts, by loop 5's blind judge,
and by loop 6's blind judge as its **first** note on our screen. Fifth loop.

### 3. MINOR — a sentence's pinyin is set three ways across three screens

Probed: on the quiz card and summary the sentence line is 14px `rgb(111,104,92)`
(`--hq-ink-subtle`), tone colour deliberately off. In the browse sheet the `ex-run` line is 17px
`rgb(26,24,21)` (`--hq-ink`), full-strength. `progress/shots/loop-6/design-system-sheet-mobile.png`
shows the collision inside one viewport: headword 啊 prints `a` in teal, the sentence 20px below
prints the same 啊 as plain black `a!`, and the WORDS WITH card below prints it as orange `ā` —
one syllable, one screen, three colours.

### 4. MINOR — the primary action is 45px

Probed at 45 for `btn btn-primary btn-block next` on `/quiz/2`, `btn btn-block hskq-practise` on `/`,
and `btn btn-primary flex-1` on the summary. One pixel over Apple's 44pt floor for the most-tapped
control in the app; loop 5's blind judge named 52–56pt. Unchanged.

### 5. MINOR — a third of the desktop level-select is empty

`progress/shots/loop-6/design-system-desktop.png` at 1440x900: a ~490 CSS-px void in the left rail
between the intro paragraph and the "4,308 cards…" footnote, plus a blank third grid cell beside
HSK 5. No other gap in the system is near that size.

### 6. MINOR — `.stack` still has zero callers, fifth loop

`grep -rn 'class="[^"]*\bstack' src --include='*.svelte'` → 0, and `src/routes/layout.css:136` now
says so in its own comment. Three `spaced={false}` overrides survive at `LevelCard.svelte:235` and
`+page.svelte:162-163` although `false` is the default; loop 4 asked for their deletion, they are now
documented, so this is cosmetic.

## Biggest gap

**Make every control edge that sits directly on the page `--color-line-strong`, starting with the
`.say` pill, and add the assertion that keeps it there.**

Four one-line changes: `SpeakButton.svelte:58` (`.say`), `WordCard.svelte:350` (`.tool`),
`layout.css:790` (`.card`, which carries `.hskq-card` and the summary's `.card word`), and drop the
now-redundant `.hskq-featured` override at `LevelCard.svelte:304` — let the featured card earn its
rank from its filled `Practise` button and `Start here` chip, not from being the only card with a
visible outline. Reserve `--hq-line` for rules **inside** a surface — the `WordRow` separator, the
divider above YOU PICKED, the sheet's section rules — where a hairline is the whole point.

While you are in `SpeakButton`, fix the two things two independent judges hit on the same component:
its fill is pure `#ffffff` on a `#faf8f5` page (the only white on the quiz screen — use
`--color-surface-sunken` or no fill at all), and on `/quiz/[level]` it must leave the pinyin's
baseline and sit on the centred axis under the gloss, so the screen has one vertical axis instead of
three.

Then close the guard gap that let this survive: `palette.spec.ts:142` proves the token clears 3:1
but never checks a consumer. Add a spec that reads every `.svelte` and `.css` under `src/`, collects
each `border*: … var(--color-line…)` declaration, and fails any one whose selector is not on the
allow-list of *inside-a-surface* rules. A token that measures 3:1 in a test and 1.23:1 on screen is
the same class of defect as loop 5's fidelity assertion.

Ship it with the proof at 375px in dark: re-shoot
`progress/shots/loop-6/design-system-dark-summary-mobile.png` with **Entry** and **Listen** reading
as the same kind of object as `10 more`, and `progress/shots/loop-6/design-system-quiz-mobile.png`
with the Listen pill centred, in-palette, and bounded.
