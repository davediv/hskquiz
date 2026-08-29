# Verdict — quiz-card, loop 2

**FAIL.** The loop-1 failure (reveal pushing the CTA off an iPhone SE) is genuinely closed — verified in the running app, 24/24 trials at 375×667 with `scrollHeight` unchanged across the tap and all four answer-button tops identical to 0.1px. But closing it by making the stage a fixed box moved the cost onto the character, and two of the three new majors are regressions paid for by that fix.

## Surviving findings

### 1. major — The reveal shrinks the headword, and shrinks it most when the answer was wrong
`.prompt` is `grid-template-rows: auto minmax(0,1fr) auto` and `.under` is the third `auto` row. Unanswered, `.under` is **empty** (0px). Answered, it fills with pinyin + gloss + POS + the "you chose" chip, and every pixel of that comes out of the `1fr` middle row — which is `.hero`, the size container whose `cqh` the hanzi is sized against (`QuestionPrompt.svelte:238`). So the reveal pays for itself out of the character.

Measured: 375×667 **112.5px → 72.1px** on a wrong answer (8/8, −36%); 112.5 → 106.1px on a correct one. 360×640: 108 → 68px. 320×568: 55.6 → 40px, the `max(2.5rem, …)` floor — the formula wanted *less*.

Evidence: `quiz-card-se-wrong-mobile.png` (北京 at 72px) beside `quiz-card-se-correct-mobile.png` (次 at 106px) — same viewport, same run. The wrong answer is smaller **because** it is wrong: the "you chose" chip is the tallest row and only a miss renders it. The file's own header says the reveal is "the only moment the whole word … is on screen at full size"; on a 667px phone it is the moment it is 36% below full size.

### 2. major — Tone 1 is byte-identical to the error colour, in both themes
`layout.css:141 --hq-tone-1: #c8102e` = `:119 --hq-accent: #c8102e` = `:312 --color-wrong`. Dark: `:178` and `:164` are both `#f2685e`. Tone 2 `#1f7a3d` is a near-twin of correct `#0e7a53`.

`quiz-card-320-mobile.png` is the whole case in one frame: a green **✓ CORRECT**, and directly beneath it "jīn tiān" set entirely in `rgb(200,16,46)` — the app's "you got this wrong" red — on a screen that says you were right. `quiz-card-se-wrong-mobile.png`: "jīng" is the same red as the ✕ badge and the miss ring on the same frame. `quiz-card-wrong-mobile.png`: "nín" is tone-2 green 40px above a green correct-answer button, on a NOT QUITE screen. `quiz-card-dark-mobile.png`: "gān" is the same salmon as the ✕ badge.

Loop 1 flagged this exact hex collision. The mechanism changed (pinyin is no longer `--color-accent`); the collision survived. `--color-focus: var(--hq-accent)` (`:320`) puts the focus ring in the same red.

### 3. major — "Next word" materialises 8.4px below the last answer with no delay and no pointer-events guard
The *space* is reserved (`.action { min-block-size: 2.875rem }`, `+page.svelte:419-429`) so nothing shifts — that is what closed loop 1. But the button itself appears instantly into space that read as empty when the finger came down, 8.4px below the answers at 375×667 (14.4px at 375×812). Repro via Playwright touchscreen: tap 4px above choice 4's bottom edge, wait 60ms, tap 16px lower — the question advanced **past the reveal** 6/6 at both sizes. `.next` carries no animation, delay, or disabled window. The header claims the fixed layout "stops a fast second tap from hitting a different control"; it stops the *buttons* moving and lets a destructive control take their place.

### 4. minor — The production (meaning→hanzi) question is ~28% empty air
`quiz-card-e2h-mobile.png` at 375×812: ~110px blank above "thirsty", ~114px below "Show pinyin" — 224px of 812 — because the stage is dimensioned for the tallest reveal and a one-word English prompt cannot fill it. The four candidates being discriminated (好/白/渴/大) are 30–36px; the same 渴 is 112.5px half a second later in `quiz-card-e2h-answered-mobile.png`. Same root as #1.

### 5. minor — Pinyin out-measures the hanzi on narrow phones
320×568: 今天 ink ~77px wide, "jīn tiān" ~92px (`quiz-card-320-mobile.png`); 我们 81px vs "wǒ men" 107px; 360×640, 正 is 50px against an 81px pinyin line. Pleco sets its headword at ~26–32px but never lets the PY line out-measure it. Same root as #1.

### 6. minor — The `30vw` ceiling, not the space, decides 1- and 2-character words
112.5px (=30vw) for both 您 and 早上 at 375px; only 干什么 drops to 103.4px via the `100cqw/chars` term. 你 renders 73px in a 335px column (22%). The "sized by the space, not by a guess" claim only binds at three characters or more — and those are the minority in HSK 1.

### 7. minor — The reveal restates the correct button verbatim and never shows the word in a sentence
`quiz-card-correct-mobile.png`: "early morning" at 18px (y377) and again at 16px (y444). `quiz-card-se-wrong-mobile.png`: "capital city of China" twice, ~100px apart. Both references spend that slot on context — `reference/screenshots/pleco/pleco-iphone-02.png` gives POS, sense, then four hanzi/pinyin/English example sentences; `reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png` goes headword → word → the word in a real sentence. Our four lines carry three facts and one repeat.

## Blind design judge

**It picked ours, by a large margin.** Mapping: A = `reference/screenshots/pleco/pleco-iphone-02.png`, B = our `quiz-card-correct-mobile.png`. The judge chose **B** and called the gap **large** — "B is the only one of the two where someone clearly made decisions; A is a competent 2013-era utility running on system defaults." It named the 早上 hero band, the five-tier scale, the single semantic green across five applications, the 20pt margin held by every element, and the 55–57pt tap targets. Its `whatWeakerMustChange` list is addressed to **Pleco**, not to us; there is no deficit to manufacture there.

What it did flag in ours, judging blind, is worth keeping:

- "The pinyin splits 'zǎo' blue against 'shang' grey, which imports a second accent hue that appears nowhere else and reads **arbitrary**." A fresh eye did not read the tone colouring as a system. That is the same line finding #2 is about, seen from the other direction: the colours are not merely colliding with the semantic palette, they are not yet legible *as* tone.
- The answer meaning shown three times (gloss, eyebrow, highlighted option) — independent corroboration of #7.
- The check badge is hard-left while the option label is centred, so the badge reads orphaned from its text.
- "Next word" sits ~17pt off the bottom, tight against the home indicator.

Note the judge saw only the 375×812 **correct** reveal. It never saw the 667/640/568 shrink or a wrong answer, which is where findings #1 and #2 do their real damage — the win is real, but it was scored on this piece's best frame.

## Biggest gap

**Make the headword one size. Reserve the reveal's `.under` block in the unanswered state too, so the character never shrinks at the moment the learner got it wrong.**

In `src/lib/components/quiz/QuestionPrompt.svelte`, render the pinyin / gloss / POS / "you chose" rows in *both* states — `visibility: hidden` while unanswered, or give `.under` a fixed `block-size` sized to the tallest reveal *including* the chose chip — so the `1fr` middle row, and therefore `92cqh` at line 238, resolves to the same value before and after the tap. Then drop the `30vw` term from the `min()`, so the question state cannot start larger than the reveal can sustain: let the hero take whatever `min(100cqw/chars/1.08, 92cqh − reserve, 8.5rem)` gives.

Acceptance: at 375×667, 360×640 and 320×568, `getComputedStyle(document.querySelector('.stage .face')).fontSize` is byte-identical before and after the tap, on a correct answer **and** on a wrong one; and the hanzi is never out-measured in width by its own pinyin line (it is today at 320×568 and 360×640).

This is one edit and it closes four of the seven findings — #1, #4, #5 and #6 all trace to the same fixed stage being paid for out of the character. Do not trade it back for a scrolling page; the loop-1 fix is sound and must stay.

*(Finding #2 is two hex values in `layout.css` — move `--hq-tone-1` off `#c8102e`/`#f2685e` and `--hq-tone-2` off collision with `--hq-correct`. It is not the biggest gap because it is not a design problem, it is a typo with a semantic consequence. Fix it on the way past.)*
