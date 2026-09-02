# Verdict — level-select, loop 6

**Pass: no.** Loop 5's assigned gap is genuinely closed: every gloss now sits with its own
word, `Browse →` is out of the third hanzi's column, and the empty state holds one uniform
322px card height at 375, 320 and 1440. But three majors survive, one of them raised for the
third consecutive loop and independently named by an outside judge, and the card's hierarchy
still points away from the quiz it exists to start. Not at reference standard yet.

## Blind design judge

The judge picked **A** over **B**, margin **large**. Per
`progress/blind/loop-6/level-select/mapping.json`, **A is ours**
(`progress/shots/loop-6/level-select-mobile.png`) and B is Du Chinese's Articles collection
(`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`). **We won, plainly** — for
the second loop running, and by the larger of the two available margins. Its
`whatWeakerMustChange` list is addressed to Du Chinese, **not to us**; do not action it. Its
praise is specific and ours: three registers on one optical baseline in the headline, a 2.3:1
hanzi-to-gloss ratio, the `初等 ELEMENTARY · HSK 1–3` rule as an editorial device rather than a
stock h2, warm `#F7F5F0` ground, filled-vs-outlined pills encoding a recommendation.

Its criticisms of us are the ones that matter, and all three are already below: tone-coloured
pinyin "drops five hues into a two-colour screen … reads as an accident without a legend"; the
progress bar "shows a ~7% filled stub under the label '0 of 500 practised'" in a taupe that
"matches nothing else"; the `BROWSE →` link is "a thin target beside a 56pt button." Caveat as
last loop: the judge saw one static zero-progress hero shot. It did not see 320px, the weak-word
state, or the tap-zone probe.

## Surviving findings

### Major

1. **Tone colour rides the pinyin and never the character — third loop raised, nothing changed.**
   `progress/shots/loop-6/level-select-card1-empty-3x.png`: `xièxie` prints rgb(122,63,168)
   purple + rgb(44,98,99) teal, `māma` orange + teal, `xǐhuan` blue + teal. Fifteen words on a
   first visit carry five hues, at 14px — the second-smallest type on the card — while every
   `.hskq-hz` is a flat rgb(26,24,21) at 36px. There is no key on the screen and no tone
   drilling on this screen. Because `spaced={false}` concatenates syllables, the hue change is
   the *only* syllable boundary, so each two-syllable word reads as half-highlighted or
   half-errored. Both references invert this: Pleco colours the glyph and sets the romanisation
   solid black (`reference/screenshots/pleco/pleco-iphone-01.png`, 手 blue / 机 red); Du Chinese
   puts tone as coloured underlines beneath the hanzi and sets pinyin in one ink
   (`reference/screenshots/duchinese/ui/duchinese-iphone-04-ui.png`). Loop 5 finding 8.

2. **The card's hierarchy points away from the quiz.** On the screen whose only job is to reach
   a session, `.hskq-more` (`BROWSE →`) is rgb(200,16,46) brand red on all five cards, while
   `Practise` is a filled black slab on HSK 1 only and a white/rgb(142,135,120) outline on
   HSK 2–5. An HSK 4 learner scrolls past a black slab they don't want to reach a pale outline
   they do. `progress/shots/loop-6/level-select-full-mobile.png`. Du Chinese's equivalent single
   CTA is a solid brand-red full-width pill
   (`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`).

3. **Two invisible, vertically adjacent, full-width tap zones with an unmarked boundary.**
   `document.elementFromPoint` across HSK 1's card at 375x812 (box x=20 y=198 335x322): rows
   y+78…y+210 — 132px, 41% of the card, exactly the band holding all three hanzi — resolve to
   `/browse/1`; everything else resolves to `/quiz/1`; within that band the rightmost 16px flips
   back to `/quiz/1`. The largest, most inviting element on the card does not start a session,
   and nothing in `level-select-card1-empty-3x.png` marks either edge — no underline, no
   chevron, no hover-independent affordance.

### Minor

4. **Height rhythm holds only until the app is used.** Empty is now perfect (322px × 5 at
   375/320/1440, was 274/290/273/290/290). Seeded, HSK 1 is 347px against 322px
   (`level-select-weak-mobile.png`) and 382px against 322px at 320 with 教学楼/大学生/图书馆
   (`level-select-longwords-320.png`). Loop 5 finding 4 is half-closed.

5. **Two entry shapes inside one list, chosen by English length.** `flex: 1 1 auto` on `.hskq-gl`
   (`LevelCard.svelte:441`): at 320 in HSK 1's weak set, "classroom building" and "university
   student" take their own full-width lines while "library" sits inline beside `túshūguǎn`
   (`level-select-longwords-320.png`). Three items, two alignments, no inferable rule.

6. **Counts still contradict the official list, reconciled ~1,300px later.** Cards print
   500/770/969/999/1,070 (`level-select-full-mobile.png`); `reference/hsk/hsk30-official-L{1..5}.json`
   hold 500/772/973/1000/1071. The colophon accounts for all 8 exactly but sits at y≈1,960 of a
   2,155px document while HSK 2's "0 of 770" is at y≈645. Unchanged from loop 5 finding 7.

7. **Desktop misses the viewport by 50px and leaves the rail half empty.** At 1440x900
   `scrollHeight = 950`, so the word-list colophon line is sliced at the bottom edge of
   `level-select-desktop.png`; the rail runs blank from y≈230 to the colophon at y≈716 — 486px,
   54% of viewport height. Loop 5 finding 6 moved the colophon rather than filling the hole.

8. **The zero meter reads as progress, and the first word changes only its hue.** At 0 the track
   is 301x8 with a 28px rgb(142,135,120) cap — 9.3% filled directly above "0 of 500 practised"
   (`level-select-card1-empty-3x.png`). At 3 of 500 `.hskq-fill` is also exactly 28px
   (`min-inline-size: 1.75rem`, `LevelCard.svelte:365`), so `level-select-weak-mobile.png` shows
   an identically-sized bar that has merely turned green. Better than loop 5's hairline-plus-speck,
   still not reading a quantity at either end.

## Biggest gap

Take the tone hues off the pinyin and put tone on the character, so the card's loudest colour is
on the thing being learned rather than on the crutch beside it. In
`src/lib/components/levels/LevelCard.svelte`, set the preview's `<Pinyin>` in a single muted ink
— widen `src/lib/design/Pinyin.svelte`'s existing `tones={false}` contract (today documented as
ink-surface-only) rather than hand-painting a colour over pinyin — and if tone must survive on
this screen, carry it on the hanzi the way Du Chinese's reader does
(`reference/screenshots/duchinese/ui/duchinese-iphone-04-ui.png`): a ~2px tone-coloured rule
under each character inside `<Hanzi>`. Pleco's version — colour the glyph, set the romanisation
solid black (`reference/screenshots/pleco/pleco-iphone-01.png`, 手 blue / 机 red, `shǒujī` black
bold) — is equally acceptable. Do it here first, not project-wide: the quiz card is where tone is
being drilled and may keep its colour. Verify at 375x812 with zero progress, then with HSK 1's
weak set seeded to 地/的/个 (localStorage `hskquiz:progress:v1`,
`{"v":1,"w":{"L1-0066":[6,1,0,<now>,<now>],"L1-0067":[7,2,0,<now>,<now>],"L1-0120":[5,1,0,<now>,<now>]}}`).
Acceptance: a 3x crop of any card shows each word's romanisation in exactly one ink — no more
`xièxie` reading as purple-then-teal — and the whole 375px column carries at most the brand red
plus a single tone channel, replacing today's six competing hues. This is the third loop it has
been raised and the second time the blind judge, in isolation, named it as the one thing keeping
an otherwise winning design from reading as fully deliberate. Close it.
