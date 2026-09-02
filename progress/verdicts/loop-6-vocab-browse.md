# Loop 6 — vocab-browse

**Verdict: does not pass.** Loop 5's three majors are genuinely closed — verified in pixels, not
asserted — and the blind judge beat Pleco with us again. But loop 5's minors were never touched, and
one of them has been promoted by the very fix that closed the majors: with the header no longer
broken, the worst thing on this screen is that its detail sheet cannot act on the word it is showing.
Every finding below was already written down in loop 5 and shipped unchanged.

## Blind judge — we won again, and the fix list is not aimed at us

`progress/blind/loop-6/vocab-browse/mapping.json`: **A was ours**
(`progress/shots/loop-6/vocab-browse-search-mobile.png`), B was Pleco
(`reference/screenshots/pleco/pleco-iphone-01.png`). The judge picked **A — ours — gap size
"large"**, calling it "a designed screen" against "a stock app." Its eleven-item
`whatWeakerMustChange` list is an instruction to **Pleco**: rebuild the type scale, take tone colour
off the characters, kill the repeated PLC rail, add a POS gutter, build an actual header, use a
warmer ground. Those are all descriptions of things we already do. **No item on that list is work for
this repo.** Say it plainly: on the head-to-head at-rest frame, our list screen is stronger than the
reference, for the second loop running.

Three things the judge did charge against *us*, all filed as "refinements on a system that exists":
- Tone colour splits a single word into two hues mid-pinyin — `hǎochī` blue + orange, `hǎowánr` blue
  + green, visible in `A.png`. This was loop 5's minor #1 and is unchanged. It is the one item where
  the judge told the *other* app to do what we already do (annotate the pinyin) and then noted we do
  it too loudly.
- The status pips are ~15pt, undersized if tappable, floating in a wide, otherwise empty right rail.
- Four of five chips read 0 in the search state — see finding 4.

## Surviving findings

### 1. MAJOR — the word sheet's only action names the wrong level and cannot reach the word
`progress/shots/loop-6/vocab-browse-sheet-followed-mobile.png` is the whole case in one frame: 爱护
opened from HSK 1's 爱 sheet, its own badge reading **HSK 4**, its gloss reading "to take good care
of / to cherish" — and the pinned, full-width, highest-emphasis black button beneath it reading
**"Practise HSK 1"**, `href="/quiz/1"`, a session that can never contain 爱护. Two labels in one
frame contradict each other.

Source is exactly where loop 5 left it. `src/lib/components/browse/WordSheet.svelte:216`:
`const practiseHref = $derived(resolve('/quiz/[level]', { level: String(browseLevel) }));` — while
:215 derives `const level = $derived(word.level);` with the comment "Follows the word on screen, not
the level being browsed" and then **never uses it**. :631 renders `Practise HSK {browseLevel}`. The
right answer is already computed on the line above the wrong one.

There is also no URL that could carry it: `src/routes/quiz/[level]/+page.svelte` reads `page.url`
once, at :83, for `isSummaryPreview` — no `word`, no `first`, no seeding param exists. Enumerating
every control in the open sheet (24 buttons) returns speak buttons, related-word rows, and that one
anchor. Nothing acts on the word. In an app whose premise is "~10-question sessions weighted toward
past misses," the screen where you discover you don't know 按照 offers you a random draw from 969
other words instead. Pleco's entry screen leads with a "+" flashcard control
(`reference/screenshots/pleco/pleco-iphone-02.png`); Du Chinese's word popup offers Grammar /
Dictionary / Save (`duchinese-iphone-04-ui.png`).

### 2. MAJOR — one example sentence per word, where Pleco gives five
`example` is still a single object in the shipped JSON (`src/lib/data/hsk1.json`: `"example": {
"hanzi": ..., "pinyin": ..., "spans": ..., "english": ... }`) and the eyebrow is still the singular
"IN A SENTENCE." One sentence block counted in the live DOM.
`vocab-browse-sheet-mobile.png` (爱 → 我爱我的爸爸妈妈。and nothing else) and
`vocab-browse-l3-sheet-mobile.png` (按照 → one sentence), against
`reference/screenshots/pleco/pleco-iphone-02.png` where 几乎 carries five sentences filling ~70% of
the entry below the fold. One frame cannot show a pattern of use, and 按照 — a preposition governing a
clause — is exactly the word where the second and third frame teach the grammar. Loop 5 finding #4,
unchanged.

### 3. MINOR — the desktop sheet starves one column while the other overflows under the same bar
`vocab-browse-sheet-desktop.png` at 1440x900: the left column's last content, "Answered 5 times · 5
correct · 3 in a row," ends around 62% of the panel height with roughly 250px of blank cream beneath
it — the widest empty region on the screen. Meanwhile the right column's last row, "3 more HSK words
use 爱," is sliced horizontally by the black "Practise HSK 1" bar. Loop 5 finding #6, unchanged.

### 4. MINOR — the empty-search state prints five zeros above a panel that already said nothing matched
`vocab-browse-empty-mobile.png`: with "zzzz" typed, the chip row reads **0 New / 0 Shown / 0 Learning
/ 0 Shaky / 0 Mastered**, sitting between the search field and the 无 / "Nothing in HSK 1 matches
“zzzz”" panel. Five filter chips, none of which can filter anything, framed at full prominence on
top of a screen whose entire job is to say there is nothing. The chips otherwise track the result set
correctly (`A.png`: 7 New / 1 Mastered for eight "hao" hits) — this is the zero case only, and the
blind judge independently flagged the same row as "dead data given prominent framing."

### 5. MINOR — whether the search field survives scrolling depends on the learner's history
Three captures, one app, three behaviours. `vocab-browse-scrolled-mobile.png` (HSK 1 seeded, scrollY
400) and `vocab-browse-l5-seeded-scroll900-mobile.png` (HSK 5, 60 mastered + 40 shaky, scrollY 900):
level pills and search field entirely gone. `vocab-browse-l5-scroll40000-mobile.png` (HSK 5, fresh,
scrollY 40,000 of 81,694): both still pinned, because `src/routes/browse/[level]/+page.svelte`
sets `--app-chrome-fold: 0px` under `.browse[data-rows='one']` when there is no chip strip. So the
1,070-word level keeps its search box only for a learner who has never practised, and loses it the
moment they have. Pleco's list screen never hides its field. The collapse itself is correct and
binary — this is about which row it chooses to eat.

## Closed, verified in pixels

Loop 5's three majors are all genuinely fixed, and the guard rails hold. The chip strip fits (293px
of last-chip edge inside 320px, Mastered fully visible). The fold is binary — no beige band, no pill
arc at any scroll depth. The first row lands at 158px of 812, down from 238. The level switch and
search field now share one 44px row. The 76px rows, the type ramp, the inset spine and the meaning
column's fixed x are intact, which is what won the blind test. Do not disturb any of it.

## Biggest gap

**Make the word sheet's primary action act on the word it is showing.** Replace the level-scoped
`practiseHref` at `src/lib/components/browse/WordSheet.svelte:216` with one built from the `level`
already derived and discarded at :215, and teach `/quiz/[level]` a `?word=<id>` search param that
seeds the session with that word as question 1. The button at :631 then names the word's own level
and lands on a session that actually contains it.

Acceptance, all shown in screenshots of the running app:
1. Open 爱护 from HSK 1's 爱 sheet. The button reads **"Practise HSK 4"**, not "Practise HSK 1", and
   its href is `/quiz/4?word=L4-…`. One frame, badge and button agreeing.
2. Tap it. The quiz's **first card is 爱护** — captured mid-session, not inferred from the URL.
3. `/quiz/3` with no param behaves exactly as it does today: ten weighted words, no change to
   `src/lib/session/weighting.ts`.
4. A junk or cross-level `?word=` (`/quiz/1?word=L5-0400`, `/quiz/1?word=nonsense`) falls back to a
   normal session rather than erroring or rendering an empty card.

One gap, one control. **Do not** also build the star/flag toggle this loop — a persistent priority
flag touches the progress store, the weighting engine and the list row's pip strip, and it is a
different piece's surface. Land the direct route first.

Guard rails: do not touch the header — the chip strip, the binary fold and the 158px first row were
loop 5's three majors and all three are closed. Do not touch the 76px rows, the type ramp, the
tone-coloured pinyin or the inset spine; those are what beat Pleco twice. While you are in
`WordSheet.svelte`, the desktop CTA bar (finding 3) sits in the same `.foot` block — reflowing the
button is a fair moment to stop it slicing the right column.
