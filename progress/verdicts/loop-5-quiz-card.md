# Verdict — quiz-card, loop 5

**Not passing.** The loop-4 gap closed cleanly on the production card, and the teach card beat
Pleco in a blind test for the second loop running. But the fix was gated on one token, so the
*recognition* card — the card the learner sees most — did not get it, and it is now the emptiest
screen in the app.

## Blind design judge — we won, again, and large

The judge was shown Pleco's 几乎 headword screen (A) against our teach card for 车站
(`progress/shots/loop-5/quiz-card-mobile.png`, B) without being told which was which.
**It picked ours and called the gap "large."**

> "B is the only one of the two that looks authored; A looks like an OS-default reference tool
> that a study screen was never designed for… The headword is treated as a list row label, not
> as the thing being learned."

It credited the five-step type scale, the warm near-monochrome with chroma spent only on
tone-coloured pinyin, the sentence grouped by a tinted container rather than by rules, the one
full-width primary action, and 44pt+ targets. **Its `whatWeakerMustChange` list is an instruction
to Pleco, not to us — do not mine it for work.** Only the refinements it named against B directly
touch us, and they are recorded below.

One caveat the next builder must hold: the judge saw our *best* card. Every sentence it wrote
against A — list-row headword, three sizes doing the work of five, no session context, density
with no rhythm — is a sentence a judge could write against
`quiz-card-recog-un-desktop.png` if it were shown that instead.

## Surviving findings

### Major

1. **The loop-4 fix reached only one of the two question cards.** Verified closed on production:
   `.ask` prints the whole gloss as one hero, the sound slot carries the masked cloze, the gloss
   slot carries the sentence's English, and every reveal has both a speaker and the traditional
   form. It stops at `const clue = $derived(production && !answered ? sentence : null)` —
   `src/lib/components/quiz/QuestionPrompt.svelte:288`. On the recognition card at 375×812,
   `.under` runs 317.6→423.9 and only its 38px "Show pinyin" hint carries ink: the gloss slot is
   `.meaning.veiled` and the tail measures 0px wide because :430 reads
   `{:else if pos && (shown || production)}`. **68.3 of 106.3px — 64% of the reserve — is blank**,
   and the visible dead band from the hint's baseline to the first button is 82.4px, 10.1% of the
   viewport. 58.9/90.9px blank at 320×568; an 88px void at 1440×900. Stage ink 53.3% against
   66–72% on the production cards beside it. Every word passes this card between introduction and
   first correct answer, and 1 in `REFRESH_EVERY` forever after.
   *Evidence: `progress/shots/loop-5/quiz-card-recog-un-mobile.png` (晚),
   `quiz-card-recog-un-small.png` (五), `quiz-card-recog-un-desktop.png` (一边),
   `m-desktop-c0-recog-un.png` (国外).*

2. **On the production card the English hero collapses below the hanzi in the buttons under it** —
   the same "size decided by the length of the English" defect loop-4 called a major on the teach
   card, now on the card just rebuilt. `.ask` across one 375×812 session: 79.88 ("boy") → 79.46 →
   64.79 → 63.26 → 57.47 → 51.36 → 32.39 ("in the process of doing / currently"). A **2.47× swing
   between consecutive cards in one run**, against a constant 35.99px choice glyph — so on the last
   card the subject of the screen is set smaller than its options. 27.13px vs a 26.0px glyph at
   320×568; 35.14px vs a 39.6px glyph at 1440×900, where the prompt is measurably smaller than the
   buttons. The inverse also holds: "to sit down" is one 64.79px line in a 159.9px hero row, ~95px
   empty, stage ink 44.2% — below the builder's own ≥60% bar.
   *Evidence: `progress/shots/loop-5/walk-c9-prod-un-mobile.png`, `quiz-card-prod-un-small.png`,
   `quiz-card-prod-un-desktop.png`.*

3. **The desktop build sets the character smaller than the phone does, on a screen 3.8× wider.**
   Recognition `.face` measures 83.2px at 1440×900 against 119.38px at 375×812 — 30% smaller on
   the bigger screen. The run is a 504px column at x 468→972; 468px empty on each side. Against
   the bar: Pleco sets 几乎 at ~6.9% of screen width per glyph; our phone card is 32.3%, our
   desktop card 5.8% — **below Pleco, at the one viewport with the most room.**
   *Evidence: `progress/shots/loop-5/quiz-card-recog-un-desktop.png`, `m-desktop-c0-recog-un.png`,
   `m-desktop-c2-prod-wrong.png`; bar `reference/screenshots/pleco/pleco-iphone-02.png`.*

### Minor

4. **The reveal throws away the sentence the learner was reading one tap earlier**, exactly when it
   first becomes readable. `clue` is null once `answered` (:288) and `.aside` is `{#if teaching …}`
   (:445), so the reveal gets no sentence panel either. Du Chinese holds the word block *and* the
   sentence block on the same reveal under hairline-ruled labels
   (`reference/screenshots/duchinese/duchinese-iphone-05-ui.png`).
   *Evidence: `quiz-card-prod-un-mobile.png` vs `quiz-card-prod-right-mobile.png` (半年 reveal is
   hanzi + pinyin + "half a year" and 59px of blank column).*

5. **The traditional form is drawn two ways, two sizes, in one component.** Teach: `<p class="trad">`
   at `sm`, centred on its own row (〔車站〕, `quiz-card-mobile.png`). Reveal: `<p class="trad tucked">`
   at `xs` grey, flush to the left frame edge inside the sound row with the speaker pinned right —
   turning a centred axis into a three-object row with two objects on the margins
   (〔一下兒〕 at x≈27px, `walk-c0-prod-wrong-mobile.png`). The blind judge independently flagged the
   related defect on the teach card: the traditional is set larger than the English gloss that is
   actually the answer.

6. **The 30px tail row is permanently blank for 1 word in 7.** `{:else if pos && (shown || production)}`
   (:430) prints nothing before the tap in the recognition direction (0px measured on every such
   card), and **76/500 HSK 1 words and 95/770 HSK 2 words carry `pos: []`** — verified against
   `src/lib/data/hsk1.json` / `hsk2.json`. 一下儿, 没关系, 坐下 all render an empty 30px band where
   "adverb" sits on the card before them.

### Note (not a finding)

The `cells` fallback (:295) and its header comment — "the second block for the 3,038 words that
have no sentence yet" — is dead code. **All 4,308 shipped words at L1–L5 now carry an example**
(verified: 500/500, 770/770, 969/969, 999/999, 1070/1070). Every card has a sentence to spend.

## Biggest gap

**Draw the sentence on the recognition card too.** In
`src/lib/components/quiz/QuestionPrompt.svelte:288`, change
`const clue = $derived(production && !answered ? sentence : null)` so the clue is built in **both**
directions before the tap, then branch on direction for what the two already-reserved slots hold.
On a recognition card the answer is the English, so spend the Chinese halves and keep the English
one empty: the sound slot (`{:else if clue}`, :375) takes the sentence hanzi with the target
**bolded, not blanked** — the way `.aside` already renders it with `display={part.hit}` (:449–455),
since the character is the largest thing on screen and gives nothing away — and the `.clue-en` row
(:414) spends on the sentence's **own pinyin**, revealed by the existing "Show pinyin" hint, so one
tap now buys the whole line's sound instead of one word's.

Acceptance at 320×568, 375×667, 375×812 **and 1440×900**: no unanswered recognition card has more
than one line-gap of blank column between the last ink in the stage and the first answer button
(82.4px at 812 and 88px at 1440 today); the recognition card's stage ink lands within 5 points of
the production card's at the same viewport (53.3% vs 66–72% today); and the choice bands stay
byte-identical at 444.0–507.5 / 520.0–583.5 / 596.0–659.5 / 672.0–735.5 with
`scrollHeight === innerHeight` — nothing above the buttons may move.
