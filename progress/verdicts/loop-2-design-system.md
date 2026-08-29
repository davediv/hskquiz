# Verdict — design-system, loop 2

**PASS: no.** Loop 1's two `fail`s are genuinely fixed — tone colour now reaches every word
(`bái tiān`, `ài hào`, `bà ba` all split and paint), and the counts reconcile. What remains is not
a broken renderer, it is an undecided one: the system ships **four different answers to "where does
tone colour go"** and **two tone hues that are byte-identical to state colours**, and the screen
every learner sees first opts out of the whole thing.

Every number below was re-derived from the shipped source and data, not taken on trust. All eight
critic findings reproduce; none were overstated.

---

## Blind judge — it preferred **ours**, decisively

`progress/blind/loop-2/design-system/mapping.json`: **A = Pleco** (`reference/screenshots/pleco/pleco-iphone-01.png`),
**B = ours** (`/Users/div/Desktop/project/hskquiz/progress/shots/loop-2/design-system-browse-mobile.png`).
The judge picked **B**, gap size **large**: *"B is authored; A is assembled… A's problems are the
absence of a system."* Its `whatWeakerMustChange` list is therefore addressed to Pleco, not to us,
and I am not going to launder it into a deficit.

Two things in it do land on us, though, and both are load-bearing:

1. **It found finding #3 blind.** Its one substantive complaint about B: *"its tone red for bā/tiān
   is close enough to the 'Practise' red that a semantic data colour collides with the interface
   accent."* It had no source access. It read `--hq-tone-1: #c8102e` off the pixels.
2. **It settles finding #2 for us.** Its #1 instruction to Pleco is *"Stop colouring the hanzi…
   move tone signalling onto the pinyin alone. Six fully saturated hues in the largest type on
   screen is the single biggest craft failure here — it destroys the character silhouette."* Our
   `browse/WordRow.svelte:50-54` already argues exactly this in a comment. `WordSheet.svelte:248`
   and `summary/WordCard.svelte:98` do the condemned thing at 60px and 90px. The tie is broken:
   **hanzi stays ink; tone lives on pinyin.**

So the win is real and the browse list is the best screen in the app. It is also 1 of 5 screens.

---

## Surviving findings

### 1. MAJOR — The landing page is outside the tone system, in the colour that means "wrong"

Fifteen preview words and the hero pinyin are hand-set flat crimson with tone colouring explicitly
disabled. `levels/LevelCard.svelte:94-100` passes `tones={false} spaced={false} class="…text-accent"`;
`+page.svelte:120` hand-writes `<p class="…text-accent">cíhuì liànxí</p>` — which the file's own
header forbids ("do not hand-write `var(--color-tone-*)` in a screen"; this is the same move in the
other direction).

`/Users/div/Desktop/project/hskquiz/progress/shots/loop-2/design-system-desktop.png`: tóngyì (2+4),
mùbiāo (4+1), qūbié (1+2), xiàolǜ (4+4), xuéshù (2+4), chuántǒng (2+3) — six distinct tone patterns,
one identical #c8102e. Two taps later the same data is in four hues
(`design-system-browse-mobile.png`). The signature feature is invisible on the screen that has to
sell it, and the colour standing in for it is the exact red of ✕ NOT QUITE
(`design-system-summary-mobile.png`).

The card comment says the budget is "one accent… fifteen words in five hues would spend it fifteen
times." That is a defensible argument against *noise*. It is not an argument for *this* red.

### 2. MAJOR — Four rules for where tone lands, so 爱 changes colour when you tap it

`browse/WordRow.svelte:55`, `quiz/QuestionPrompt.svelte:115` and `quiz/ChoiceButton.svelte:97` pass
`tones={false}`. `WordSheet.svelte:248` (`<Hanzi {word} size="lg" display />`) and
`summary/WordCard.svelte:98` take the default `tones=true`. Verified in the shots: 爱 is ink #1a1815
in `design-system-browse-mobile.png`, and the **same 爱, in the sheet that row opens**, is tone-4
purple at 60px in `design-system-sheet-mobile.png`. `layout.css:130-137` states the policy as
settled — "We follow Du Chinese… It goes on BOTH the hanzi and the pinyin" — and the app follows it
on two screens out of five. The prose and the code disagree, and the code disagrees with itself.

### 3. MAJOR — Two of five tone hues are byte-identical to state colours the file says never overlap

Confirmed by grep, both themes:

| token | light | dark | collides with |
| --- | --- | --- | --- |
| `--hq-tone-0` | `#726b5f` | `#9a9184` | `--hq-ink-subtle` (identical) |
| `--hq-tone-1` | `#c8102e` | `#f2685e` | `--hq-accent` → `--color-wrong` (identical) |

`layout.css:37-40` claims tone hues "are not part of the three roles above and never overlap with
them… a red thing is a state, unless it is a 汉字 or a syllable." Recounted over shipped data:
**1,644 of 7,905 syllables (20.8%) are tone 1** and print in wrong-red; **327 (4.1%) are tone 0** and
print in de-emphasised grey. `design-system-summary-mobile.png` is the proof shot: 那儿 sets 那
purple and 儿 in the app's own disabled-text grey at ~90px, and the card directly below sets 句 in
wrong-red at ~90px **under a red ✕ NOT QUITE eyebrow**. The deuteranope escape hatch in the comment
("the tone is already written in the diacritic") covers pinyin. It does not cover hanzi, which has
no diacritic — and hanzi is where this is largest.

### 4. MAJOR — The spacing scale added for loop-1 #7 is documented and unused

`layout.css:70-80` declares 2xs…3xl plus `--spacing-block`, `--spacing-section` and `.stack`, and
asserts "Every gap between blocks should be one of these, not a number somebody picked while looking
at one screen." Measured: `class="…stack…"` → **0 matches**; `--spacing-block` / `--spacing-section`
→ **0 consumers outside layout.css**. 19 uses of any `--spacing-*` token against 156 hand-written rem
gaps, 78 of them off-scale (0.625rem ×17, 0.375rem ×17, 0.875rem ×8, 0.1875rem ×7…). The rhythm is
prose, not layout — which is precisely what the judge praised B for having and Pleco for lacking.

### 5. MAJOR — The landing page prints a causal claim the reference does not support

`+page.svelte:62` is literally `const mergedPairs = officialTotal - SHIPPED_TOTAL;`, rendered at
line 127 as "8 pairs of same-pinyin homographs share a card"
(`design-system-mobile.png`, `design-system-desktop.png`). I counted duplicate
(digit-stripped simplified, pinyin) pairs **within each level** across
`reference/hsk/hsk30-official-L{1..5}.json`: **6**, not 8 — 面¹/面² and 省/省 (L2), 把/把, 任/任,
为/为 (L3), 批/批 (L4). Per level the shortfall is L2 −2 (2 dups), L3 −4 (3 dups), L4 −1 (1 dup),
L5 −1 (**0 dups**). So L3 and L5 are each missing one row to something that is not a homograph.
Because the figure is a subtraction, any future data loss silently relabels itself as more
homographs and the sentence stays "true". The comment at :55-60 says the derivation exists so it
"can never drift out of step" — it has the failure mode backwards.

### 6. MINOR — Eliminated-option border is 2.21:1 against the file's own ≥3:1 contract

`ChoiceButton.svelte:186` `color-mix(… line-strong 70%, page)` computes to **#aea99e on #faf8f5 =
2.21:1** and **#504a40 on #100f0e = 2.18:1**. `layout.css:87` sets ≥3:1 for interactive borders and
says a hairline "must not be the only thing defining a control". In
`design-system-picked-mobile.png` "difficult" and "many" float. The real loop-1 defect (gloss at
2.72:1) *is* fixed — this is a knowingly-taken step, owned in the comment at :179-183. It is still
a stated contract, broken.

### 7. MINOR — `--color-line-strong` misses its own ≥3:1 in dark mode

Computed from shipped values: #6b6355 on sunken #211e1a = **2.80:1**; on surface #191714 = 3.02:1;
on page #100f0e = 3.23:1. Sole 1px border of controls in `SearchField.svelte:119`,
`ChoiceButton.svelte:127`, `WordSheet.svelte:473`. Light mode passes (3.06–3.57:1).

### 8. MINOR — `--text-hanzi-2xl` is dead; desktop grid leaves a card-sized hole

`size="2xl"` appears **0 times** across `src/` (sm ×13, xs ×5, xl ×4, lg ×3, md ×2, prompt, hero) —
the only step on either Chinese scale with no caller, unchanged since loop 1. And in
`design-system-desktop.png` the 3+2 group split strands HSK 3 alone beside an empty ~500×330 cell
while the left rail stops at ~40% viewport height. Mobile is tight and confident; desktop is the
mobile stack widened.

---

## Biggest gap

**Give tone its own five hues, then let the landing page use them.**

In `src/routes/layout.css`, move `--hq-tone-1` off `#c8102e` / `#f2685e` and `--hq-tone-0` off
`#726b5f` / `#9a9184` — pick a tone-1 red and a tone-0 neutral that no state, text or border token
holds in either theme, and add the assertion to the accessibility contract at :84-92 so it cannot
drift back. Then delete `tones={false} spaced={false}` and `class="…text-accent"` from the
`<Pinyin>` at `levels/LevelCard.svelte:94-100` and replace the hand-written
`<p class="…text-accent">cíhuì liànxí</p>` at `+page.svelte:120` with a tone-coloured `<Pinyin>`, so
the first screen's sixteen pieces of pinyin are painted by the same rule as every other piece of
pinyin in the app.

Do the palette half **first**. Turning tone colour on at the landing page while `--hq-tone-1` is
still `#c8102e` paints xièxie, bā, mùbiāo and qūbié in the wrong-answer red and spreads the
collision instead of fixing it — which is the flaw the blind judge spotted in our browse list with
no access to the source. This one change is what makes finding #1 and finding #3 both go away, and
it is the prerequisite for the follow-on that findings #2 and the judge agree on: keep `tones={false}`
on hanzi everywhere and remove the default-true colouring from `WordSheet.svelte:248` and
`summary/WordCard.svelte:98`, so 爱 is the same colour in the row and in the sheet that row opens.
