# Verdict — quiz-card, loop 3

**FAIL.** The loop-2 gap is genuinely and completely closed, and the blind judge picked this
card over Pleco by a large margin. It still fails, for a reason neither of those two facts
touches: on a fresh device the card under review never asks a question. Ten cards out of ten
are teach cards, and the teach card is 58% empty air.

## What loop 2 closed — verified, not claimed

Loop-2 findings #1 (the reveal shrinking the headword) and #3 (the unguarded "Next word") are
**dead**. `.face` font-size is byte-identical across the tap at every viewport and on both
outcomes: 375×812 119.38 → 119.38 (看 wrong, 渴 right); 375×667 94.6881 → 94.6881 and 77.3087 →
77.3087; 320×568 63.7244 → 63.7244. `scrollHeight == innerHeight` (812/812, 667/667, 568/568)
in every run. A raw pixel diff of `q-h2m-before.png` against `wrong-h2m-after.png` (750×1624,
threshold 12) shows the hero band y145–333 **unchanged** and exactly four changed bands — the
answer boxes at 444–508 / 520–584 / 596–660 / 672–736, identical to the unanswered geometry.
The arming guard holds: advanced past the reveal 0/4 at 60ms, 0/4 at 150ms, 0/4 at 300ms, 4/4
at 500ms. Loop-2 finding #2 (tone hex = error hex) is also fixed at the hex level.

## Surviving findings

### 1. major — On a fresh device `/quiz/1` is ten teach cards and zero questions, and the teach card is 58% empty
`cardKindFor` (`src/lib/session/index.ts:292`) returns `introduce` for any word with no record,
so a first session is all introductions by design — the design is defensible, the card it hands
the learner is not. At 375×812 `.stage` runs 115.7→735.9 (620.3px) and `.prompt` occupies
292.8→554.8 (262px), centred: **177.1px of nothing** above the NEW WORD eyebrow and **181.1px**
between "noun" and the Got it pill. 358.2 of 620.3 = 57.7% of the stage, 44% of the viewport.
`.prompt.teach` (`QuestionPrompt.svelte:261-262`) caps the hero band at `--hero-max / 0.92`, so
老师 is held to the same 119.38px a question card gets even though no answer buttons are
competing for the column.

Evidence: `progress/shots/loop-3/quiz-card-mobile.png` (老师 — the void is the dominant element
in the frame); `progress/shots/loop-3/m812-teach.png`; end-of-first-run
`progress/shots/loop-3/firstrun-end.png` reads "10 new words … These were shown, not tested."
Du Chinese spends this exact slot on the word inside a real sentence
(`reference/screenshots/duchinese/ui/duchinese-iphone-05-ui.png`).

### 2. major — The character's size is now decided by the length of its English gloss
The loop-2 variance moved off the time axis onto the word axis. One session at 375×667, all
production cards: 正 97.2px, 八 94.7, 想 77.3, 呢 77.3, 着 77.3, 口 **72.3** — a 34% swing inside
one run on one phone, with the smallest character being the one with four strokes and the most
room. At 320×568: 家人 63.72, 钱包 61.60, 口 **44.22**.

Mechanism: `meaningSize()` (`src/lib/components/quiz/quiz.ts:116-121`) steps on
`gloss.trim().length` (>62 → sm, >42 → base) but the *wrap* is decided by rendered width. 口's
"mouth · measure word for family members" is 39 chars, so it stays at 18px, measures 351px
against a 335px column, wraps to two lines and eats 24px out of the `1fr` hero — while 正's
*longer* 44-char gloss steps down to 16px and stays on one line. Measured against the live
335px/18px box, 11 of 500 L1 glosses overflow (了 呢 着 想 送 …).

Evidence: `progress/shots/loop-3/long-667-smallest.png` (口 dwarfed by its own two-line gloss)
beside `long-667-largest.png` — same viewport, same run.

### 3. major — The reveal adds almost nothing the screen was not already showing
On a recognition card the revealed gloss repeats the correct button verbatim; on a production
card it repeats the prompt. `right-h2m-after.png`: "thirsty" at y=755 in the reveal and
"thirsty" again at y=953 on the green button, 100px apart. `prod-before.png` asks
"good-looking" with "nice to look at" beneath it; `prod-after-wrong.png` reveals "good-looking ·
nice to look at" — the same two glosses restated. Four lines carry hanzi, pinyin, glosses and
POS: no traditional form (the data has `traditional` and `summary/WordCard.svelte:169-180`
already renders it bracketed), no character breakdown, no sentence. Both references spend this
slot on context — `reference/screenshots/pleco/pleco-iphone-02.png` gives POS, sense, then four
hanzi/pinyin/English examples plus CHARS/WORDS/SENTS tabs. Same root as #1: the teach card *is*
this block with the buttons removed (`shown = answered || teaching`).

### 4. minor — The quiz card is the only word surface in the app that cannot speak
Correcting the critic here: the app **does** speak. `src/lib/components/summary/speech.ts`,
`summary/SpeakButton.svelte` and `browse/WordSheet.svelte:141-161` all drive `speechSynthesis`,
and `firstrun-end.png` shows a working Listen pill on every summary card. The quiz card — whose
own header calls the reveal "the only moment the whole word … is on screen at full size" — is
the one place the machinery is not wired in, and it shows tone-coloured pinyin the learner
cannot hear. Pleco puts a speaker on the headword, the JP row and every example sentence
(`reference/screenshots/pleco/pleco-iphone-02.png`, five glyphs in one screen). This is a
missing import, not missing work.

### 5. minor — Tone hues no longer collide byte-for-byte, but still read as verdicts
`layout.css:166-169` is now `--hq-tone-1 #b8440c` / `--hq-tone-2 #356807` against
`--hq-accent/--color-wrong #c8102e` and `--hq-correct #0e7a53`; dark `:211-214`
`#ec6316`/`#63ad24` against `#f2685e`/`#4ecb93`. The exact-hex collision is fixed, the hue
families are not. `recog-dark-after-right.png` shows "✓ CORRECT" in mint with tone-2 "huí" in
yellow-green 40px below it. The blind judge, seeing our frame cold, independently called the
tone-4 purple on "kàn" "an orphan hue that belongs to no system" — a fresh eye still does not
read this colouring *as* tone.

### 6. minor — The production prompt reads as two disconnected fragments
`prod-before.png` at 375×812: `.ask` "good-looking" spans y211–263; `.also` "nice to look at" is
absolutely positioned into the reserved gloss slot at y365.6–389.9. An empty column separates a
phrase from its own continuation, and the second half is smaller and muted grey, so it reads as
an unrelated caption.

### 7. minor — A card that cannot be answered from what it shows
`long-667-largest.png`: 正 asked as "just at that moment · right in the middle of", choices
正在 / 先 / 很 / 正 — the distractor *contains* the answer character and its gloss ("in the
process of doing") is a near-synonym in English. Marked ✕ NOT QUITE for a pick nobody could
have ruled out.

### 8. minor — ~145px of reserved void in the unanswered state
At 375×812 unanswered, `.sound-slot` ends at 361.6 and the first choice starts at 444 (82px of
blank reserved `.under`); the last choice ends at 735.9 and the `.action` strip 750–796 holds
nothing until the tap. Visible as a clean band in `hint-mobile.png` (那里). This is the honest
price of the loop-2 fix and must not be bought back by unfixing it — but it is the state the
learner spends most of the session in, and it is the same empty block as #1 and #3. The
header's "one viewport tall, buttons pinned to the bottom" claim is true and verified.

### 9. minor — blind-judge nits on our own frame
Neutral option labels sit at ~4:1 against their tint; the black "Next word" pill crowds the last
option at ~30pt and sits tight to the safe area; centred labels in rows that also carry a
left-aligned status badge read optically off-centre against rows that don't
(`wrong-h2m-after.png`).

## Blind design judge

**It picked ours, by a large margin, on the deliberately unflattering frame.** Mapping: A =
`reference/screenshots/pleco/pleco-iphone-02.png`, B = our `wrong-h2m-after.png` — the *wrong*-
answer reveal at 375×812, chosen precisely because loop 2's judge only ever saw the correct one.
It chose B and called the gap **large**: "B looks authored; A looks assembled from platform
defaults… B commits to one idea — the character is the subject." It named the four-step scale,
the counter where only the "3" is bold, the recessive YOU CHOSE chip ("that chip is the tell"),
colour disciplined to ink/warm-grey/one crimson/one green used only semantically, the single
40pt gutter, and the 55–56pt targets. Of Pleco it said the screen "was inherited, not designed."

Its `whatWeakerMustChange` list is therefore addressed to **Pleco, not to us** — there is no
deficit to manufacture from it. What it did say about ours is folded into findings #5 and #9.
Note what it could not see: the teach card (finding #1) was not in the frame it judged, and a
teach card is what a new learner gets ten times out of ten.

## Biggest gap

**Fill the teach card. Stop capping its hero, and put the two things it has no answer to — a
speaker and the traditional form — into the band that frees up, using the components that
already exist in `src/lib/components/summary/`.**

In `QuestionPrompt.svelte:261-262`, drop `calc(var(--hero-max) / 0.92)` from
`.prompt.teach { grid-template-rows: … }`. A teach card owns 620px of column and has no answer
buttons competing for it; let 老师 run to ~200px instead of the 119.38px a question card gets.
Then spend the remaining band on: (a) `<SpeakButton text={word.hanzi} pinyin={word.pinyin} />`
on the pinyin line — `summary/speech.ts` and `summary/SpeakButton.svelte` already work, are
already shipped on the summary screen (`firstrun-end.png`), and the `.sound-slot` is already a
fixed-height cell built to hold a 36px button; and (b) the bracketed traditional form, copying
the `tradSize` logic from `summary/WordCard.svelte:107-112,169-180`. Neither needs new data or
new code — both are imports.

Acceptance: at 375×812, 375×667 and 320×568 the teach card's `.prompt` occupies ≥80% of
`.stage` height; the headword is strictly larger on a teach card than on the question card that
follows it; tapping the speaker says the word.

**Do not buy it back with the loop-2 shrink.** On question cards `.face` font-size must stay
byte-identical across the tap (119.38 / 94.69 / 63.72), and the pixel bands at y145–333 and
444–736 must stay unchanged. The teach card has its own grid rule; change only that rule.

*(Fix #2 on the way past, it is four lines: size the meaning by measured width rather than
`gloss.length`, or clamp `.gloss-slot` to one line's height, so the character stops being sized
by the length of its English definition. It is not the biggest gap because it costs 口 25px;
the teach card costs every new learner their entire first session.)*
