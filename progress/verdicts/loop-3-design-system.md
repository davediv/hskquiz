# Verdict — design-system, loop 3

**Result: does not pass.** The blind judge preferred our screen by a large margin, and loop 2's
colour gap is genuinely closed. But the piece under judgement is the *system*, and the system is
still prose: its named rhythm has zero callers after three loops, its scale has no executable
test, and layout.css grew a rule this loop that a shipped component already breaks.

## Blind judge

Ours was **B**; the reference (Pleco `pleco-iphone-02.png`) was **A**. The judge picked **B, gap
"large"**, unprompted: "B is a composed screen; A is a stock iOS shell with information poured
into it." Its ten-item `whatWeakerMustChange` list is therefore **instruction for Pleco, not for
us** — do not mine it for work. We are ahead on this comparison and should say so plainly.

Three things the judge did flag against *us*, and they survive: the tone hues "aren't tied to
anything else in its palette and arrive with no legend"; there is no audio affordance; and "the
left-aligned '1/10' chrome axis never reconciles with the centred content axis" — visible in
`design-system-quiz-mobile.png`, where the progress row is flush left and everything below it is
centred.

Note the direct conflict with the critic: the judge read the quiz screen's emptiness as "a clear
200px band of air" and "deliberate silence" — a strength. The critic read the same pixels as 55%
dead air. The judge is right about the *look*. The critic is right about the *cause*: the band is
a byproduct of `justify-content:center` in a `1fr` region, not a declared step. A good result that
no rule produced is still a system failure, and it is the only reading under which both hold.

## Surviving findings

### Major

**1. The spacing rhythm is documented and unused; the type scale is declared and unenforced.**
Verified: `grep 'class="[^"]*stack'` across `src --include='*.svelte'` returns **0**. `--spacing-block`
and `--spacing-section` have **0 consumers outside layout.css** (declared at `layout.css:382-383`,
described at length at `:91-93` and `:620-660`). Meanwhile 220 hand-written rem gap/margin/padding
literals ship, and the off-scale ones dominate: `0.625rem` ×23, `0.375rem` ×22, `0.125rem` ×10,
`0.1875rem` ×7, `0.3125rem` ×6, `0.4375rem` ×5, `0.6875rem` ×4, `0.0625rem` ×4, plus `2.5rem`,
`1.75rem`, `3.5rem`, `2.375rem`, `1.375rem`. `--spacing-*` references did rise to 84 — real
progress — but the file still asserts "Every gap between blocks should be one of these, not a
number somebody picked while looking at one screen," and that sentence is false in its own repo.
`--text-hanzi-2xl` (5.5rem, `layout.css:301`) has **zero consumers** for the third loop running —
its only reference is `Hanzi.svelte:73`'s own SIZE_CLASS map.

**2. The scale half of the "executable contract" has no tests at all.** `layout.css:100` claims the
accessibility contract is executable "computed off this stylesheet by `palette.spec.ts`". True for
the three colour rules. But `palette.spec.ts` has 6 assertions, all contrast; `typography.spec.ts`
(150 lines) tests only font *stacks* and tone ΔE. Neither file contains a single assertion about a
spacing step or a type step. That is why findings 1 and 3 can persist across three loops without
anything going red.

**3. The landing page derives a factual claim by subtraction instead of counting it.**
`+page.svelte:68` is `const mergedPairs = officialTotal - SHIPPED_TOTAL`, rendered at `:219-221`
and visible in `design-system-desktop.png` as "4,308 cards from the standard's 4,316 entries — 8
pairs of same-pinyin homographs share a card." I recounted from `reference/hsk/hsk30-official-L{1..5}.json`
directly. **The critic's "two words are simply missing" does not survive** — normalising the
parenthetical gloss forms the build strips (初（初一） → 初, 品（工艺品） → 品) gives collapse counts
of 0/3/4/1/1 = 9 against shortfalls of 0/2/4/1/1 = 8, so L3, L4 and L5 reconcile exactly and only
L2 is off by one. No data is lost. But two real defects remain: the figure is a subtraction, so any
future data loss will silently re-read as "more homographs"; and `sizes.ts:7` names the eight pairs
as 老省把初任为批品 — which omits **面|miàn**, a genuine same-level L2 duplicate, and includes 老,
whose two rows are in *different* levels (L1 and L2) and so are not a same-level homograph at all.
The prose that justifies the number contradicts the files it cites.

### Minor

**4. A rule added this loop is already broken by shipped code.** `layout.css:108-109` now reads
"...and neither may be diluted with `color-mix` to below 3:1 and still be called a control edge."
`ChoiceButton.svelte:186` is `color-mix(in srgb, var(--color-line-strong) 70%, var(--color-page))`,
and the comment at `:179-184` names and *defends* the resulting 2.3:1. `palette.spec.ts:142` tests
only the raw token, so the new clause is unenforceable prose. Either raise the muted border to 3:1
or delete the clause — writing a rule the repo violates is worse than not writing it.

**5. Tone 0 and tone 3 are the closest pair in the palette, in both themes, and are the pair a
beginner most needs separated** (bǎ vs ba). Confirmed from the shipped values at `layout.css:165-169`
and `:206-214`: tone-0 `#5a6674` slate vs tone-3 `#1f5fbf` blue = 13.9 ΔE00 light, `#8fa0b4` vs
`#7faeff` = 12.0 dark — the minimum of all ten pairs, barely over the file's own ≥10 floor. Visible
in `design-system-darkbrowse-mobile.png`: 吧 `ba` and 百 `bǎi` five rows apart read as one blue at
14px. The stated escape hatch — the diacritic carries the tone — is a 3px caron at that size.

**6. Desktop is the mobile stack widened.** `design-system-desktop.png` at 1440×900: the 3+2 grid
leaves an empty cell beside HSK 5, the left rail's last line ends at ~43% of page height with
nothing below it, and layout.css offers two width tokens and no two-column rhythm.

## Biggest gap

**Make the spacing and type scales executable, the way the colour contract already is — then obey
what the test says.** Add `src/lib/design/scale.spec.ts` alongside `palette.spec.ts`, parsing the
same source it does, with three assertions: (a) every `gap`/`margin`/`padding` literal in any
`.svelte` or `.css` under `src/` is either a `--spacing-*` var or a value on the 4/8/12/16/24/32/48/64
scale — the ~90 off-scale literals listed in finding 1 are the starting failure list; (b) every
declared `--spacing-*` and `--text-*` step has at least one consumer outside its own declaration
and outside `Hanzi.svelte`'s SIZE_CLASS map — this fails today on `--spacing-block`,
`--spacing-section` and `--text-hanzi-2xl`; (c) any `color-mix` used as a border resolves to ≥3:1
on its surface — this fails today on `ChoiceButton.svelte:186`. Then make it green by *deciding*
rather than by loosening the test: adopt `.stack`/`--spacing-section` on the quiz and browse
columns so the 206px and 244px voids in `design-system-quiz-mobile.png` are a declared step and
not a leftover from `justify-content:center`; delete `--text-hanzi-2xl`; and either raise the muted
choice border to 3:1 or delete the clause at `layout.css:108-109`. A design system whose colour
rules fail loudly and whose scale rules are paragraphs is half a system, and it is the half that
has not moved in three loops.
