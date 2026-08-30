# Verdict — quiz-card, loop 4

**Not passing.** The card kind that got rebuilt this loop is genuinely excellent — it beat Pleco
in a blind test. The two card kinds the learner actually sees most were not touched, and one of
them is now the worst-composed screen in the app.

## Blind design judge

The judge was shown our teach card (B) against Pleco's headword screen (A) without being told
which was which. **It picked ours, and called the gap "large."**

> "B is composed; A is configured. B gives the Chinese real presence — 早上 set at roughly 140pt
> occupies the entire upper third as a hero image rather than a line of text, which is the single
> decision that matters most on a vocabulary card, and A never makes it."

It credited our four-step type scale, the two-warm-neutral palette with accent reserved for pinyin,
the example grouped by ground rather than by rule, and the one committed full-width primary action —
and it recommended Pleco adopt every one of them. **Its `whatWeakerMustChange` list is an instruction
to Pleco, not to us.** Do not mine it for work. The only items in it that touch us are the three
refinements it named against B directly, recorded as minor findings below.

This is the first time this project has beaten a reference app on its own ground. `quiz-card-mobile.png`
is the standard the rest of the piece now has to meet.

## Surviving findings

### Major

1. **The production card ("PICK THE CHARACTER") splits one gloss into two disconnected fragments.**
   `.ask` prints "good" at 44px black at y213–262.3; `.also` prints "fine" at 14px warm grey at
   y365.6–389.9 — 103.3px of dead column between two halves of the *same* gloss, which the reveal
   then prints back as one line, "good · fine". Total ink in the 328.3px stage: 73.6px, **22%**.
   Cause is structural, not cosmetic: `ask = primaryGloss(word)` sits in `.hero` (:147, :257) while
   `extraGlosses = word.meanings.slice(1)` is overlaid in `.gloss-slot` (:145, :303) — two different
   grid rows for one phrase. `fullGloss` already exists and is already bound to `meaning` (:148).
   `cardKindFor` serves this card two questions in three once a word has one correct recognition.
   *Evidence: `quiz-card-prod-mobile.png`, `quiz-card-prod-answered-mobile.png`.*

2. **The speaker and the traditional form went onto the teach card only — the reveal, which the
   learner reaches on every answered card, got neither.** Both are gated on one token:
   `teaching && word.traditional …` (:176–177) and `{#if teaching}<SpeakButton …>` (:269). Across
   60+ answered cards at 320×568 / 375×667 / 375×812 / 1440×900, `.sound-slot button` is null after
   every tap. The desktop reveal for 还是 prints hanzi, pinyin, gloss and POS but no 〔還是〕 — while
   the teach card for 楼上 prints 〔樓上〕 and a Listen pill in the same slot. The file's own header
   (:36) justifies the speaker with "the quiz was the one word surface that could not speak, while
   printing tone-coloured pinyin the learner had no way to hear." The reveal still is that surface.
   *Evidence: `quiz-card-correct-desktop.png` vs `quiz-card-desktop.png`.*

3. **The taught character's size is still decided by the length of its English.** Loop-3 finding #2
   was fixed for the gloss and immediately reintroduced by the new sentence panel. At 320×568, one
   session: 说 — a **one**-character word — renders at 70.998px because its English wraps to two
   lines and its 〔說〕 row exists, pushing `.aside` to 132.8px and collapsing `.hero` to 77.2px so
   the `92cqh` term binds; 常常 — a **two**-character word — renders at 94.32px. The two-character
   word's glyphs are 33% larger. Wider in the same sweep: 电影院 at 52.53px against 大学生 at
   84.85px, both three characters, a 61% swing. `.prompt.teach`'s hero track is
   `minmax(0, calc(--hero-max / 0.92 + 1.25rem))` — a **maximum** — and the trailing `1fr` aside
   track floors at its own content (:423–427, :567).
   *Evidence: `teach-568-smallest.png` (说) beside `teach-568-largest.png` (常常), same viewport,
   consecutive cards.*

### Resolved this loop — verified, not taken on the builder's word

- **The loop-3 gap is closed and closed well.** `.prompt` fills 94.2% of the stage at 375×812
  (loop 3: 42%), 95.5% at 667, 97.0% at 568. Teach headword strictly larger than the question card
  that follows (152.27 vs 119.38px at 812). Listen pill on all 27 teach cards at all three viewports.
  Traditional renders bracketed. HSK 1/2 get a sentence panel with the target bolded; HSK 4/5 get a
  character-by-character breakdown. Zero console and page errors.
- **The header's layout claim is true and the handed-down premise was wrong.** The answer stack is
  bottom-pinned: last choice bottom at 90.6% of 812, 91.0% of 932. There is no two-thirds dead zone.
- **The loop-2 no-shift guarantee is intact.** A raw 750×1624 pixel diff of unanswered vs answered
  returns eleven changed bands; the four choice bands are byte-identical in geometry and 本 is
  pixel-identical across the tap. This must survive whatever comes next.
- **Hanzi size is past the bar, on the record so nobody "fixes" it.** Pleco sets a headword at ~8%
  of screen width; we set the question card at 32% and the teach card at 41%.

### Minor

4. **142px — 17.5% of the viewport — of the unanswered question card is reserved and empty.**
   `.under` runs 317.6→423.9 but only its 38px sound slot carries anything, leaving 82.4px blank
   before the first choice at 444; `.action` 750→796 holds nothing until the tap. This is the honest
   price of the no-shift fix and must **not** be bought back by unfixing it — but the teach card has
   now proved the same column can be filled without moving anything.
   *Evidence: `quiz-card-question-mobile.png`.*

5. **The reveal restates the button the learner just tapped**, same weight, ~175px away — "measure
   word: books" at y755 in the reveal and again at y1105 on the green button.
   *Evidence: `quiz-card-answered-mobile.png`.*

6. **Three refinements the blind judge named against our own card:** uneven vertical rhythm from flex
   distribution rather than an 8pt scale; the Listen pill breaks the centred axis; blue/teal pinyin is
   the one undisciplined colour move in an otherwise disciplined palette. All three are visible in
   `quiz-card-mobile.png`. Refinements, not rebuilds — take them only after the gap below.

7. **The desktop frame is unauthored relative to the mobile one.** At 1440×900 the run is a ~700px
   phone column centred in the window with the top 150px and outer thirds empty.
   *Evidence: `quiz-card-correct-desktop.png`.*

## Biggest gap

**Rebuild the production card's prompt the way you just rebuilt the teach card — one gloss block in
the hero, and the freed band spent on a masked example sentence.** It is the emptiest screen in the
app at 22% ink, and `cardKindFor` serves it two questions in three.

In `src/lib/components/quiz/QuestionPrompt.svelte`:

1. **Print the whole gloss as one block in the hero.** Bind `.ask` to `fullGloss(word)` — the same
   value `meaning` already uses (:148) — so the hero reads "good · fine" at hero size in one place.
   Delete `showAlso` (:163–165), `extraGlosses` (:145) and the `.also` element (:303) with its style
   block (:669). No two parts of one gloss may be separated by more than a line gap.
2. **Spend the band that frees on the second block the teach card already carries: the example
   sentence with the target word masked.** Ungate `example` (:174) for `meaning-to-hanzi`, and reuse
   the split at :184 — it already returns `parts` with the target marked `hit: true`, so masking is
   one branch on that part (render a blank rule instead of `part.text`), and the reveal un-masks it
   in place on the tap by rendering the same parts unmasked. Same panel, same ground, same geometry.
3. **While you are in those two gates, delete the word `teaching &&` from the traditional form
   (:176–177) and the `{#if teaching}` around `<SpeakButton>` (:269)** so the reveal speaks and shows
   〔還是〕 in both directions. `.sound-slot` is already a fixed 38px box sized for the button.

**Acceptance at 375×812, 375×667 and 320×568:** the production prompt's ink covers ≥60% of the stage
(22% today); no two parts of one gloss separated by more than one line gap; the reveal speaks and
shows the traditional form in both directions.

**Do not buy it back with movement.** `.face` must stay 119.38 / 94.69 / 63.72 byte-identical across
the tap, and the four choice bands must stay at css 444.0–507.5 / 520.0–583.5 / 596.0–659.5 /
672.0–735.5. The no-shift guarantee is two loops old and is not currency.
