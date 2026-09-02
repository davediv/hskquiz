# Verdict — quiz-card, loop 6

**Not passing** — but the reason is narrow and the piece is close. Loop 5's biggest gap closed
cleanly: `.clue-face` now draws on the unanswered card in *both* directions, and the dead band
from the last stage ink to the first answer button fell from 82.4px to 20.1px at 375×812
(8.0px at 320×568, 12.9px at 375×667, 19.0px at 1440×900). Loop 5's findings 2 and 3 are also
closed — the English hero no longer inverts against the choice glyphs anywhere measured, and the
desktop character is now 129.5px against the phone's 119.38px. What is left is that the *reveal*
never got the same treatment, so the card the learner tapped **from** is now richer than the card
they tapped **for**.

## Blind design judge — we won, and the judge called the gap large

The judge was shown Pleco's 几乎 headword screen (A) against **our reveal** for 车站
(`progress/shots/loop-6/tmobile-s2c9-recog-right.png`, B) — deliberately not the teach card that
won loop 5 — and picked **B, ours**, gap "large".

> "B is an authored screen; A is a stock dictionary UI… four unambiguous typographic steps…
> B's own faults are refinements to a decision, not the absence of one."

It credited the 115px near-black headword owning the upper third, tone-coded pinyin, the warm
off-white ground, ~65px thumb-sized options, the redundant answered state (tint + 2px border +
check disc + CORRECT label) and the black pill terminus. **Its `whatWeakerMustChange` list is
addressed to Pleco and is not work for us — do not mine it.** The four faults it named against
*ours* are: the off-axis floating audio button, orange+purple tone hues reading as a third and
fourth colour family, an 11px option gap against 16px before the CTA (so "See results" reads as a
fifth option), and low-contrast distractor borders. Those are the only judge-derived items in
scope, and none of them outranks the finding below.

Note what the win does **not** cover: the judge could not see the card one tap earlier, so it had
no way to know that B is thinner than the screen it replaced.

## Surviving findings

### Major

1. **The reveal deletes the sentence it just showed, and never completes the cloze.**
   `const clue = $derived(!teaching && !answered ? sentence : null)`
   (`src/lib/components/quiz/QuestionPrompt.svelte:355`) nulls the sentence the instant an answer
   lands, and `.aside` is gated `{#if teaching && sentence && example}` (:528), so no answered card
   in either direction has a sentence panel at any viewport. Probed at 320×568, 375×812 and
   1440×900: `.clue-face` and `.aside` both null in every answered state.
   - Production 一边 at 375×812: before the tap the stage carries 我们坐在桌子的\_\_\_\_。 plus its
     English; after it those rows carry `yìbiān` / gloss / "YOU CHOSE yìqǐ together" and
     **我们坐在桌子的一边。 is never drawn at all** — the app opens a blank and never fills it.
     (`tmobile-s2c6-prod-un.png` vs `tmobile-s2c6-prod-wrong.png`.)
   - Correct recognition is thinner still: 车站 at 375×812 loses 车站在学校旁边。 and gains
     `chēzhàn` + "rail station · bus stop", while `noun 〔車站〕` is the **byte-identical** `.meta`
     box (446.0→464.6 at 1440×900) that was already on screen. One tap buys two new lines, repeats
     a third, and costs an eight-character sentence.
     (`tmobile-s2c9-recog-un.png` vs `tmobile-s2c9-recog-right.png`;
     `tdesktop-s2c6-recog-un.png` / `-right.png` for 知道 at 1440×900.)
   The room exists: the teach card's `.aside` is 157.8px at 375×812 and holds 28px hanzi + pinyin +
   English (`quiz-card-mobile.png`). Bar: Du Chinese's reveal holds a word block *and* a sentence
   block on one screen (`reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png`); Pleco's
   headword screen holds the gloss plus five worked examples
   (`reference/screenshots/pleco/pleco-iphone-02.png`).

### Minor

2. **Sentence pinyin is flat grey, unaligned, with the target unmarked** — against this app's own
   documented rule. `.clue-py` (:483) and `.sen-sound` (:540) both pass `tones={false}`, but
   `Pinyin.svelte:18–22` reserves that flag "for exactly one situation: pinyin on a surface that
   already owns its colour, such as an ink-filled button". Both sit on the plain page ground. The
   teach card bolds 开车 inside 我哥哥会开车。 and then prints "Wǒ gēge huì kāichē." as one uniform
   grey run with `kāichē` unmarked (`quiz-card-mobile.png`); the recognition hint does the same
   with "Wǒmen liù diǎn chīfàn." (`s-mobile-c5-recog-hint.png`) while the word's own pinyin two
   rows away *is* tone-coloured. Pleco bolds `jīhū` inside its pinyin line; Du Chinese sets pinyin
   per-syllable above each character (`duchinese-iphone-04-ui.png`). We do neither.

3. **The prompt still takes its size from the length of the English.** Nine production cards
   sampled across 320×568 / 375×812 / 430×932 / 1440×900: `.ask` runs 43.19 / 43.87 / 59.68 /
   64.79px at 375×812 — a **1.50× swing between consecutive cards in one run** — against a constant
   35.992px `--choice-face`. At 320×568 the floor is 27.13px against a 26px glyph, a 1.04× margin
   (`tsmall-s2c3-prod-un.png`, "to know someone / to recognize"). Loop-5's outright inversion is
   gone everywhere measured; the subject of the screen still changes size by half again card to
   card.

4. **The 30px `.meta` tail is permanently blank for words with neither a part of speech nor a
   traditional form** — 1 of 16 sampled cards at 430×932, and 看病 at 375×812 (empty box
   393.9→423.9 while the card beside it prints "verb" there). Matches the builder's own 155/4,308
   (3.6%) estimate.

5. **1440×900 is a phone parked in an empty window.** `.run` measures x 468→972 — a 504px column
   with 468px of cream on each side, 65% of the width unused — and the last answer pill ends at
   y 772.5, leaving 127.5px of dead column. The character scaled up (129.5px, loop-5 finding 3
   closed) but the four pills are still 62px and the sentence 28px, the phone's own numbers.
   (`tdesktop-s2c6-recog-un.png`.)

## Biggest gap

**Keep the sentence on the reveal, and finish it.** In
`src/lib/components/quiz/QuestionPrompt.svelte:355`, change
`const clue = $derived(!teaching && !answered ? sentence : null)` so the sound slot holds the
sentence in **both** states: before the tap as today, and after the tap with the target set in ink
and — on a production card — **the blank replaced by the answer it was hiding**, so
我们坐在桌子的\_\_\_\_。 is finally drawn as 我们坐在桌子的一边。 in front of the learner. Pay for it
with rows already on screen: move the word's own pinyin down onto the gloss row beside the meaning
(`chēzhàn · rail station · bus stop`) with the speaker button trailing it. That is **zero new
rows**, so nothing below the stage moves. While in that row, drop `tones={false}` from `.clue-py`
(:483) and `.sen-sound` (:540) — `Pinyin.svelte:18–22` reserves that flag for coloured surfaces,
not the page ground — and set the target word's own syllables in ink there the way `.clue-face`
already sets its hanzi, so the pinyin line can be matched against the characters the way Pleco's
bold `jīhū` can.

**Acceptance** at 320×568, 375×667, 375×812 and 1440×900: every answered card — right and wrong,
both directions — shows its example sentence with the target in ink and no blank left unfilled; a
before/after pixel diff confines changed rows to the four choice bands (444.0–507.5 / 520.0–583.5 /
596.0–659.5 / 672.0–735.5 at 375×812), the action band (750.0–795.5) and, on a production card
only, the hero row, with `scrollHeight === innerHeight` in both states; and **no row of the reveal
is a verbatim repeat of a row that was on screen before the tap** (today `.meta` is byte-identical
at 446.0–464.6).
