# Verdict — level-select, loop 5

**Pass: no.** Loop 4's assigned gap (clipped glosses) is genuinely closed — nothing is
truncated at any width in any state. But the fix relocated the English into a single merged
run, and the run no longer lines up with the words it describes. That is a legibility failure
on 5 of 5 cards on a first visit, so the piece is not at reference standard yet.

## Blind design judge

The blind judge picked **A = ours** over **B = Du Chinese's Articles collection**
(`progress/blind/loop-5/level-select/mapping.json`), margin **large**. Its reasons: hanzi
given the hero at real scale, four independent hierarchy levers (size / weight / case /
tracking / colour), the filled-vs-outlined `Practise` pills encoding a recommendation, and the
warm `#F7F5F2`-against-white two-value ground. Its `whatWeakerMustChange` list is addressed to
Du Chinese, not to us — do not action it. Its one criticism of us stands and is echoed below:
the tone palette is "genuine indiscipline" (green + purple + orange + blue alongside brand red
and a pink badge).

Caveat: the judge saw one static zero-progress screenshot. It could not see the weak-word
state, the 320px width, or the misalignment measured below, all of which the running-app critic
did see. A blind win on the hero shot is not a pass on the piece.

## Surviving findings

### Major

1. **Glosses are not under their own words; `Browse →` is the third word's only caption.**
   In `progress/shots/loop-5/card1-empty-3x.png` and `level-select-mobile.png` (375x812, zero
   progress): 谢谢[17–112] 妈妈[120–215] 喜欢[223–318], but the gloss line packs left as
   "thank you"[17–73] · "mother"[73–125] · "to like"[125–171]. "to like" sits entirely under
   妈妈; 47 of "mother"'s 52px sit under 谢谢; nothing at all is printed from x=171 to the card
   edge except `Browse →` at x=247 — inside 喜欢's column. Identical on all five cards and at
   320 (192 vs 186–263) and 1440 (234 vs 214–304), visible in `level-select-desktop.png`.
   `LevelCard.svelte:299` asserts the glosses "map onto the row above in the same order" — the
   order holds, the alignment does not. Pleco never fuses definitions across entries
   (`reference/screenshots/pleco/pleco-iphone-01.png`).

2. **The merged `·`-joined string severs a definition mid-phrase on the learner's own words.**
   `progress/shots/loop-5/card1-weak-3x.png` (HSK 1 weak set 地/的/个, 375x812): line 1 reads
   "turns a word into an adverb · marks", line 2 "possession like 's · measure word: general
   purpose". 的's definition breaks across a line, away from 的, and a 12px middle dot is the
   only thing separating three different words' English. Three lines at 320. Nothing clips —
   but the state the preview row exists to serve is the one it reads worst in.

### Minor

3. **The 0% meter is still a rule, not a meter — third loop raised.** `.hskq-track` renders
   301x6px with a transparent background and a single 6px `.hskq-origin` dot
   (`level-select-mobile.png`, `ls-empty-320.png`). Du Chinese at "0/12 chapters read" paints a
   filled ~90px end-cap on a visibly thicker track
   (`reference/screenshots/duchinese/ui/duchinese-iphone-08-ui.png`).

4. **Card heights are ragged.** 320x568 zero progress: 274 / 290 / 273 / 290 / 290 — the 17px
   spread is purely whether the merged gloss wraps. Personalised HSK 1 is 315 against 273 for
   its neighbours at 375, 332 against 273–290 at 320. Loop 4 held a uniform 298–299.
   Fixing finding 1 fixes this.

5. **Long weak words silently drop the row to two columns.**
   `level-select-longwords-mobile.png`: only 毕业生 不要紧 under YOU KEEP MISSING, right third
   empty, `Browse →` alone in it. Better than loop 4 (no more silent revert to stock words),
   but the card still leaves the family.

6. **Desktop wastes the bottom of the left rail.** 1440x900, no scroll: colophon ends y=394,
   last card bottom y=710 — 316px of the 224px rail blank (`level-select-desktop.png`).

7. **Counts contradict the official list ~1,100px before they are reconciled.** Cards print
   500/770/969/999/1,070; `reference/hsk/hsk30-official-L{1..5}.json` hold
   500/772/973/1000/1071 (verified). The colophon explains the 8 exactly, but on a 375 phone it
   sits at y=1,743 while HSK 2's "0 of 770" is at y≈645.

8. **Tone colour rides the pinyin, not the character.** `level-select-desktop.png`: 15 pinyin
   strings across ~4 hues plus the hero's cíhuì liànxí, no key, on a screen where nobody is
   drilling tone. Pleco colours the hanzi itself. The blind judge independently called this the
   design's one real indiscipline.

## Biggest gap

Bind every preview gloss to its own word and get `Browse →` out from under the third hanzi. In
`src/lib/components/levels/LevelCard.svelte`, delete the merged `.hskq-glosses` paragraph (the
`{#each preview}<span class="hskq-gl">` run and its CSS `·` separators at :494) and move each
word's gloss inside that word's own `<li>` in `.hskq-preview`, restructuring the 3-column row
into three stacked full-width entries in Pleco's list shape
(`reference/screenshots/pleco/pleco-iphone-01.png`): hanzi + tone-coloured pinyin inline on
line 1, that word's own gloss on line 2 directly beneath it. At 375 the card's content box is
301px, which sets the worst case — "measure word: general purpose", 193px at 12px — on one line
with 100px to spare, so nothing clips at any width and no gloss can land under a character that
is not its own. Then pull `.hskq-more` out of the preview block entirely: put `Browse →` on the
meter row or beside the "HSK N" title, because at 247/192/234 (375/320/1440) it renders inside
the third hanzi's column on all five cards, making "BROWSE" the third word's only caption.
Budget: three stacked entries cost roughly 177px against today's 110px — about +67px per card,
+335px on a 1,914px mobile document. If that is too much, show two words instead of three; at
~150px per column a two-line gloss fits under each without shrinking the 36px hanzi. Verify at
320x568 first with HSK 1's weak set seeded to 地/的/个 (localStorage `hskquiz:progress:v1`,
`{"v":1,"w":{"L1-0066":[4,1,0,<now>,<now>], …}}`) — the case that today splits "marks
possession like 's" across a line break — then re-check 375 and 1440 and confirm all fifteen
static glosses sit directly beneath their own character, and that the five cards return to one
uniform height.
