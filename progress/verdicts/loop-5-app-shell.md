# Verdict — app-shell, loop 5

**PASS: no.** Loop 4's named fail is genuinely and completely closed — I re-measured it rather
than trusting it. But the same uncapped mechanism that caused it moved next door and got worse:
`/browse/1` now holds **224px of a 375px landscape frame (60%)** and **234px of an 812px portrait
frame (28.8%)** before the first of 500 words. Portrait chrome went 220 → 234 in one loop —
*up*, on a number the shell's own source file names as the failure it exists to prevent. A budget
that drifts upward while its owner is watching a different screen is not a budget.

Every measurement below is my own, taken against the running app on `127.0.0.1:5177`, not
inherited from the critic.

## Verified closed from loop 4

The landscape quiz overflow is gone, at four widths, two cold contexts each (`isMobile`,
`hasTouch`, fresh browser per run):

| viewport | scrollHeight | innerHeight | last control bottom |
| -------- | ------------ | ----------- | ------------------- |
| 812x375  | 375          | 375         | 351                 |
| 844x390  | 390          | 390         | 377                 |
| 667x375  | 375          | 375         | 351 / 372           |
| 932x430  | 430          | 430         | 378                 |

`documentElement.scrollHeight === innerHeight` every time; the primary control is fully on screen
every time. Loop 4's 12px regression and loop 3's original clipping are both retired.
`progress/shots/loop-5/app-shell-quiz-landscape-812x375.png`, `-844x390.png`, `-667x375.png`,
`-932x430.png`. The home bar's permanence charge is also answered: at scrollY 800 the header
measures top -57 / bottom 0 with zero interactive elements stranded, `--app-header-h` → `0px`
(`app-shell-home-scrolled-mobile.png`). And `document.title` now distinguishes the two quiz
states — `HSK 1 practice · hskquiz` vs `HSK 1 results · hskquiz`.

## Blind design judge — we won again, large margin, fourth loop running

Ours was **B** (`progress/shots/loop-5/app-shell-mobile.png`); the reference was **A**
(Du Chinese's Articles screen, `reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`).
Mapping: `progress/blind/loop-5/app-shell/mapping.json`. The judge, not knowing which was which,
picked **B**, gap size **large**.

> "B is a designed screen; A is an assembled one… A is a screen in a Chinese-learning app
> containing essentially zero Chinese… a hierarchy any recipe or news app could run unchanged."

Its ten-item `whatWeakerMustChange` list is **addressed to Du Chinese, not to us** — put hanzi at
34–40px display scale, build five separated type registers, collapse to one accent, kill the
centred nav title, put spacing on a 4px scale. We already do all of them; that list is the
description of our screen, written by someone told to fix theirs. **No deficit is manufactured
below, and nothing from that list is imported.**

Three asides the judge volunteered *against* B are real and belong to other pieces: five saturated
tone hues are "crayon-bright and unmodulated" (design-system), the 0% progress rail "reads like a
rendering bug" (level-select), and `BROWSE →` is "a ~13px target well under 44px" (level-select).
Carried, not counted here. **Every shell finding below is behaviour, not looks.**

## Surviving findings

### Fail

**1. `/browse/1` in landscape spends 60% of the viewport on chrome and leaves 1.9 word rows.**
Measured at 812x375: `header.bar` 0→47, `div.controls` 47→**224**, of a 375px frame. First word
爱 at top 228; row height 76px; 375 − 228 = 147px = **1.9 rows visible**. Same defect at 932x430:
controls 47→224 of 430 = **52%**, first row top 228.
`progress/shots/loop-5/app-shell-browse-landscape-812x375.png`,
`app-shell-browse-landscape-docked-812x375.png` (docked 160/375 = 43%, still under 3 rows).

The mechanism is exactly locatable. `src/lib/components/shell/shell.css:137` brings the bar down
in landscape (`--app-bar-h` 3.5rem → 2.875rem, header 57 → 47) and stops there. Browse's own
three stacked rows — level pills + "500 words", search field, All/New chips — are 177px, and the
*single* rule that collapses them to one line is
`src/routes/browse/[level]/+page.svelte:879`: `@media (min-width: 60rem)`. That is 960px. No
landscape phone (812 / 844 / 932) ever reaches it. `chrome.svelte.ts:1-3` says the shell owns the
chrome budget; the shell just proved in the quiz that it *can* impose a vertical ceiling in
landscape, and then did not impose one on the screen that needs it most.

### Major

**2. Portrait browse chrome REGRESSED 220 → 234px.**
At scrollY 0 on 375x812: `header.bar` 0→57, `div.controls` 57→**234** — 28.8% of the frame, first
row at 238. Loop 3 measured 220. Loop 4 measured 220 and filed it major. Loop 5 measures 234.
That is 26px past the 208px `src/lib/components/shell/chrome.svelte.ts:9-11` names as the failure
it was built to fix, and 3.25x the 72px it attributes to Pleco / 2.5x the 95px it attributes to Du
Chinese. Both reference numbers check out: Pleco puts search *inside* the 44pt nav bar
(`pleco-iphone-01.png`), Du Chinese spends one back+title row (`duchinese-iphone-07-ui.png`).
We spend three stacked rows that print "500" three times.
`progress/shots/loop-5/app-shell-browse-atrest-mobile.png`, `app-shell-browse-docked-mobile.png`.

**3. The app bar abandons its content column at every landscape phone width.**
Measured bar inner box vs the content column:

| viewport | bar inner | content column | back chevron x |
| -------- | --------- | -------------- | -------------- |
| 812x375  | 0 → 812   | 134 → 678      | 8 (126px adrift) |
| 932x430  | 0 → 932   | 194 → 738      | 8 (186px adrift) |
| 1024x768 | 240 → 784 | 240 → 784      | on the column  |
| 1440x900 | 448 → 992 | 448 → 992      | 456, exact     |

The mechanism works perfectly — it is just gated at `src/lib/components/shell/AppBar.svelte:252`,
`@media (min-width: 64rem)` = 1024px, so it switches off at precisely the widths where the shell
has just finished fighting a landscape media query for 10px of header.
`chrome.svelte.ts:59-64` states why this matters in its own words: "a full-bleed bar leaves its
chevron 430px from the content it belongs to, which is what 'a phone app stretched' looks like."
Both references keep the back control on the content axis. Visible in
`app-shell-quiz-landscape-932x430.png` and `app-shell-browse-landscape-812x375.png`.

### Minor

**4. The landscape column went from a fixed 504 to a fixed 544.** Measured 544px at 812x375,
844x390 *and* 932x430 — three viewport widths, one number. Loop 4's instruction was explicit:
"cap it with a `max-inline-size` that scales instead of a fixed one." The fixed value was raised
by 40px and left fixed. At 932x430 that is 388px (42% of the width) of dead margin on the screen
whose vertical is the binding constraint.

**5. The summary H2's accessible name still carries raw template whitespace — third loop running**
(loop 3 finding 5, loop 4 finding 5). Live DOM on `/quiz/1?state=summary`:
`H2:"3\n\t\t\t\t\t\twords to review"`. A screen reader announces the count, a pause across six
tabs, then the noun. The other half of loop 4's finding 5 is fixed (titles now differ), but the
bar reads `HSK 1` in both states, so nothing in the frame distinguishes a finished run from a live
one. `app-shell-summary-mobile.png` vs `app-shell-quiz-mobile.png`.

**6. `/` still spends 57px at rest on a bar with zero interactive elements**, naming the product
113px above an H1 that names it again. The retraction fix is real and correct; the at-rest
duplication survives. `app-shell-mobile.png`.

## Biggest gap

**Make the chrome budget a ceiling the shell enforces on viewport HEIGHT, instead of a number
screens volunteer on width.** Concretely, in one pass:

1. In `chrome.svelte.ts`'s measure loop you already track the screen's sticky block for the fold.
   Also compute **total sticky chrome at rest** (`header` + the screen's sticky block) as a
   fraction of `innerHeight`, and enforce a hard ceiling of **22% of `innerHeight`**. When a
   screen exceeds it, the shell folds the excess itself — do not wait for the screen to volunteer
   `--app-chrome-fold`. The shell either owns this number or it should stop saying it does.
2. Fix the case that ceiling exists for. `src/routes/browse/[level]/+page.svelte:879` is the only
   rule that collapses the level pills, search field and All/New chips onto one row, and it reads
   `@media (min-width: 60rem)`. Make it `@media (min-width: 60rem), (max-height: 30rem)` so a
   short viewport gets single-row controls — the same breakpoint the shell already uses at
   `shell.css:137` and `AppBar.svelte:444`. Then cut the portrait stack too: 234px is three rows
   printing "500" three times; Pleco does the whole job in 72px by putting search inside the bar.
3. While the landscape breakpoint is open, change `AppBar.svelte:252` from `min-width: 64rem` to
   also fire on `(max-height: 30rem)`, so the bar lines up with the 544px content column at
   812/844/932 the way it already does exactly at 1024 and 1440.

**Verify by measuring, at 375x812, 812x375, 844x390 and 932x430**: `maxStickyBottom / innerHeight`
must be **≤ 22% at rest** on `/browse/1` — not only when docked — and the back chevron's `left`
must equal the content column's `left` at every one of them.
