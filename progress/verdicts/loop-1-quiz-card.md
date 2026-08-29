# Verdict — quiz-card (loop 1)

**Result: FAIL.** The screen is well designed and beat its reference in a blind comparison, but it
does not fit the shortest phone it will meet, and the only control that advances the quiz falls
off the bottom of that phone on every answered question.

## Blind design judge

The judge picked **B — ours** over **A — Pleco's headword screen**
(`reference/screenshots/pleco/pleco-iphone-02.png`), calling the gap **large**. Its
`whatWeakerMustChange` list is addressed to Pleco, not to us; there is no instruction for us in it
and no deficit to manufacture. It credited the four-step type ladder (多 ~76pt → pinyin → gloss →
part of speech), the hero scale of the character, the three-hue discipline (warm ground, near-black
ink, one crimson, one green, black CTA rather than a fifth colour), the 8pt spacing scale, and the
thumb-sized 55pt pills — and read the ten-segment rail and the letterspaced "CORRECT" as decisions
rather than defaults.

Its four criticisms of our screen, which corroborate findings below: the "Next word" button clears
the frame bottom by only ~12pt with no home-indicator inset; the unselected pill borders sit at
roughly 1.05:1 against the ground and nearly disappear; ~95pt of dead vertical space sits between
the part-of-speech line and the first option; and 多 is set in a weight heavier than a learner
should be copying.

## Surviving findings

### FAIL — the CTA lands below the fold at 375×667
`quiz-card-se-L1-answered.png` shows the black "Next word" pill sliced to a ~10px sliver at the very
bottom edge. Reproduced 4/4 on `/quiz/1` at 375×667: `scrollHeight` goes 667 → 696 / 703 / 713 / 806
the instant an answer is recorded, and the `.action` button's `bottom` reads 684.2 / 690.5 / 700.8 /
793.7 against `innerHeight` 667 — off-screen by 17.2 to 126.7px. It happens on correct answers too.
The page is not scrollable before the answer and becomes scrollable at the moment the answer lands,
so the learner is stranded on a screen that looks finished. This contradicts the file header of
`src/routes/quiz/[level]/+page.svelte`, which claims "a flex column exactly one viewport tall" with
the buttons "pinned to the bottom where a thumb already is". Root cause is one line:
`.stage { flex: 1 1 auto }` sizes intrinsically, so at 667 there is no slack to grow into.

### MAJOR — answer buttons move under the finger at 375×667
The header's anti-mistap guarantee ("Nothing in that column moves when an answer lands") is false at
667. Wrong answer on choice 1: button tops before `[343, 409, 475, 541]`, after
`[365.8, 453.6, 519.6, 585.6]` — up to +44.6px downward. A second tap at y=420 (choice 2's old box)
now lands inside choice 1's grown box. Same root cause: the `.complement` line grows the picked
`.choice` 56 → 77.8px and the reveal grows `.prompt` 165.5 → 210.1px. The claim does hold at 812.

### MAJOR — accent red and wrong red are the same value
`src/routes/layout.css:278` — `--color-wrong: var(--hq-accent);`. Both resolve to `#c8102e`, so
`QuestionPrompt`'s `.sound { color: var(--color-accent) }` paints the pinyin in the app's error red.
In `quiz-card-correct-mobile.png` "duō" is crimson under a green "✓ CORRECT"; in
`quiz-card-wrong-mobile.png` that identical crimson is the "✕ NOT QUITE" label, the miss ring and the
miss badge. The blind judge praised red-as-pinyin — it only ever saw the correct state, so it could
not see the collision. Pleco keeps its headword red as a tone signal and never reuses it for error;
Du Chinese reserves its red-pink strictly for "Common mistakes".

### MAJOR — unpicked answer labels drop to 2.72:1 contrast
`.choice.muted { opacity: 0.42 }` is applied to real content. Sampled from
`quiz-card-correct-mobile.png`: "dry" glyph pixels rgb(155,154,150) on button interior
rgb(252,251,249) = 2.72:1, below AA's 4.5:1 and below the 3:1 large-text floor; 16px/600 gets no
exemption. "old" and "capable" are equally faint, and so are "to know how to" / "to try to find" in
`quiz-card-se-L1-answered.png`. Those distractor glosses are words the learner is about to meet.

### MINOR — the hanzi ramp is non-monotonic
A 3-character word is set smaller than a 4-character one: `prompt` = `clamp(3.25rem, 17vw, 6rem)` =
63.75px at 375px, while `xl` is a fixed 68px, so `headwordSize()` steps down at 3 chars and back up
at 4. 洗手间 renders 195.1px wide in a 335px column while being the smallest-set of the three. The
shipped data has 201 three-character words against 12 four-character ones.

### MINOR — 96px of every answer row is reserved for a badge that is `display:none` on touch
`.choice` padding is `12px 48px`; the `.key` badge is gated behind `@media (hover: hover) and
(pointer: fine)`. Label width drops to 239px, and the longest shipped gloss ("measure word: slices,
flat pieces") renders at 237px — 2px under the wrap threshold, and wrapping grows the button 56 →
67.6px, which is one of the things that tips 667 over the fold. Visible in `quiz-card-mobile.png`.

### MINOR — dead space at both ends of the height range
At 1440×900 the run is capped at 42rem and top-aligned, leaving 183px of void below the CTA
(`quiz-card-desktop.png`, hanzi buttons stop at ~73% height). At 375×812 the blind judge measured
~95pt of dead band between the part-of-speech line and the first option. The mobile geometry the
brief suspected is otherwise sound at 812, and the hanzi is not undersized — 82.5px CSS against
Pleco's ~32px CSS per character.

### MINOR — tone colour is built and never used
`src/lib/design/tone.ts` ships Pleco's exact mapping and `Pinyin.svelte` takes a `tones` prop, but
`QuestionPrompt` renders `<Pinyin pinyin={word.pinyin} size="xl" />` with no `tones`. The documented
blocker (unspaced pinyin cannot be split) is a pinyin problem only — one hanzi is exactly one
syllable, so per-character colouring of the headword needs no splitting at all. Both references
encode tone as colour.

## Biggest gap

**Make the run fit 375×667 by reserving the answered state's height up front instead of letting it
grow.** In `src/routes/quiz/[level]/+page.svelte`: stop centring an intrinsically-sized `.prompt`
inside a `flex: 1 1 auto` `.stage` — give `.stage` a flex-basis sized to the tallest reveal (verdict
+ hanzi + pinyin + gloss + part of speech) so it is the same height before and after an answer;
reserve the wrong-answer `.complement` line's ~22px inside every `.choice` at all times via a hidden
second line, so a button is 78px whether or not it fills; and clamp the hero hanzi against available
height as well as width — `min(17vw, (100dvh - 57px - 300px))` or similar — so the character shrinks
on a short screen instead of shoving the CTA off-screen. Add the home-indicator inset the blind judge
asked for while you are in `.action`. Then re-verify at 375×667 and 390×664 that
`document.documentElement.scrollHeight` never exceeds `innerHeight` after an answer, and that every
answer button's `y` is byte-identical before and after the tap.
