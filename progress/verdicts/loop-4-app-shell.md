# Verdict — app-shell, loop 4

**PASS: no.** Loop 3's `fail` is genuinely closed — scroll memory now survives the app's core
loop, verified in the running app across three cold runs and both exit paths. But loop 3's *other*
named defect, the quiz control below the fold in landscape, was not fixed and got **12px worse**.
A shell that reads a previously-reported overflow, writes a comment conceding the exact number,
and ships it as someone else's problem has not met the bar. One fail-severity regression is enough
on its own.

## Blind design judge — we won again, large margin, third loop running

Ours was **B** (`progress/shots/loop-4/app-shell-mobile.png`); the reference was **A**
(`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`). Mapping:
`progress/blind/loop-4/app-shell/mapping.json`. The judge picked **B**, gap size **large**.

> "B is the only one of the two where a designer clearly made decisions; A is competent production
> default work… B's hierarchy is built, not inherited… On a Chinese-learning app that is the
> correct call, and it is the exact call A fails to make."

Its ten-item `whatWeakerMustChange` list is **addressed to Du Chinese, not to us** — put hanzi at
display scale, build a six-step type ramp, pick one alignment axis, cut the foreign blue, give the
back arrow a 44x44 hit area, impose an 8px scale. We already do all ten. There is nothing to
import and no deficit is manufactured below.

Three asides the judge volunteered against *our* screen, not knowing it was ours, are real and
worth carrying: the empty hairline progress track plus "0 of 500 practised" "says the same nothing
twice"; the 11px `BROWSE→` link is a sub-24px tap target floating over the third word column; five
hues (crimson + four tone colours) is "near the ceiling". The first two belong to level-select, the
third to design-system. **Every shell finding below is behaviour, not looks.**

## Verified closed from loop 3

Checked in the running app, not on trust. Scroll memory: `/` left at 900 → back at **900**, three
consecutive cold runs, stable at both back+150ms and back+2500ms (loop 3: 114); exiting via Browse
also 900 (loop 3: 31); `/browse/1` control still 1200 → 1200
(`progress/shots/loop-4/app-shell-home-back-at-900-mobile.png`,
`app-shell-home-left-at-900-mobile.png`). Docked back control now measures 44x44 condensed. The
summary page owns its H1. The phantom `--app-header-h` override comment is gone —
`grep -rn -- "--app-header-h:" src/` returns exactly one line. Zero horizontal scroll and zero
console errors across 28 route×width combinations (320/360/375/390/414/768/1440 × four routes);
every one measured `scrollWidth === innerWidth`. Bar does not jump on client nav (barTop 0 / barH
57 held through 1.2s sampled every 120ms). Chevron POPS on in-app history, cold deep link REPLACES.
Skip link works from depth. Dark mode clean (`app-shell-dark-mobile.png`).

## Surviving findings

### Fail

**1. In landscape the quiz's only control is 2 of its 45px — and this REGRESSED since loop 3,
which already named it.**
10 cold loads of `/quiz/1` at 812x375 (isMobile, hasTouch, fresh context): 8 of 10 render `.shell`
at **427px in a 375px viewport**, "Got it ↵" at y373→419 — 2px visible, 44px below the fold. The
two short words (水果, 叫 — no traditional-form line) render 391px, 38px of button visible. It is
never fully on screen. `progress/shots/loop-4/app-shell-quiz-landscape-812x375.png` shows the
black pill sliced by the bottom edge; `app-shell-quiz-landscape-clipped.png` shows only the top
rounded sliver. Loop 3 measured shell 415 / run 368 with 13px visible — **12px worse on an
already-reported finding**. Reproduced at 667x375 (`app-shell-quiz-landscape-667x375.png`, 7px
hidden even on the short word) and 844x390 (`app-shell-quiz-landscape-844x390.png`).

The shell did its own half right: the landscape media query fires and `--app-header-h` resolves to
47px instead of 57. But `.shell` is `min-block-size: 100dvh` — a floor, not a ceiling — and
`.shell.focus .content` adds no ceiling either, so a child that refuses to shrink simply overflows.
`+layout.svelte:224-231` states the number and assigns the fix elsewhere: *"The floor that has to
come down is the run's, not this one."* That is the shell declining to own the single guarantee
"focus mode" exists to provide.

Companion measurement, same shots: the progress rail is **504px at 667, 812, 844 AND 932** viewport
widths. `app-shell-quiz-landscape-932x430.png` runs a 504px column with 214px dead on each side
and ~47px unused below the button. The vertical ceiling is the gap; the measure is the cheap fix
that rides along with it.

### Major

**2. Browse's at-rest chrome is still exactly 220px — 27.1% of the frame — unchanged from loop 3
and 12px past the 208px the shell's own code names as the failure it was built to fix.**
At scrollY 0 on 375x812 the sticky stack is `header.bar` 0→57 and `div.controls` 57→220, so
maxStickyBottom = **220** before 百, the first of 500 words
(`progress/shots/loop-4/app-shell-browse-atrest-mobile.png`). Loop 3: 220. This loop: 220. Only
after a downward scroll does it reach 150 (`app-shell-browse-docked-mobile.png`) — still 2.1x the
72px `chrome.svelte.ts:10` attributes to Pleco and 1.6x the 95px it attributes to Du Chinese, and
those orders of magnitude check out in the references. `+layout.svelte:16` says
`THE SHELL OWNS THE CHROME BUDGET`, but the mechanism is opt-in and uncapped: `--app-chrome-fold`
is a length a screen volunteers (`browse/[level]/+page.svelte:706` offers `3.375rem`) and nothing
clamps the total. Ownership without enforcement is a comment, not a contract.

**3. On the landing screen the shell pins 57px (41px condensed) of chrome carrying a logo and
nothing else — zero interactive elements, permanently.**
On `/` the bar renders only `<span class="mark">汉</span>` and `<span class="wordmark">hskquiz</span>`
(`AppBar.svelte:109-110`). At scrollY 800 on 375x812: `header a, button, input, [role=button]`
count = **0**, barBottom = 41, `data-chrome="condensed"` — it never leaves
(`progress/shots/loop-4/app-shell-home-scrolled-mobile.png`). It is also redundant at rest: in
`app-shell-mobile.png` the bar owns y0–57, "HSK 3.0 · LEVELS 1–5" starts at y73 and 词汇练习 fills
y170–265 — the product names itself twice in the first 130px of an 812px frame. Both references
spend that row on navigation (Du Chinese: "← Articles"; Pleco: "‹ jihu" plus three controls). The
home document is 2,074px on a phone, so this is ~5% of every frame an HSK 4/5 learner scrolls past,
spent on branding.

### Minor

**4. The document head picks a status-bar style that zeroes the exact inset the shell's own comment
calls "the whole point" of being installable.**
`src/app.html:29` sets `apple-mobile-web-app-status-bar-style` to `default` beside
`viewport-fit=cover` (`app.html:5`), while the comment at `app.html:13` says the install metas
exist because they "only pay off after an install, which is the whole point of the safe-area token
system the shell carries." Under `default`, iOS insets the standalone web view below the status
bar, `env(safe-area-inset-top)` is 0, and `--app-chrome-h` collapses to the header alone — which is
what measures on all four routes: `--app-safe-top: 0px`, `--app-chrome-h: calc(0px + 57px)`.
`default` may well be right (`black-translucent` forces white glyphs over the #faf8f5 page). One of
the two is wrong and the next builder cannot tell which; whichever survives, the other must change.

**5. The summary state reuses the running quiz's `<title>`, and its H2 accessible name still
carries raw template whitespace.**
`/quiz/1?state=summary` returns `document.title === "HSK 1 practice · hskquiz"` — byte-identical to
`/quiz/1`. The tab, the history entry and the bookmark are the only places that distinguish a
finished run from a live one. `route.ts` drives the title off the pathname and the layout comment
justifies that for `canonical`, which is a different question. The heading outline still reads
`H2:"3\n\t\t\t\t\t\twords to review"` — loop-3 finding 5's second half, unfixed.

## Biggest gap

**Give `.shell.focus` a definite height and make the run fit inside it, so the quiz's only control
is never below the fold.**

Change `.shell.focus` from `min-block-size: 100dvh` to `block-size: 100dvh` with `overflow: hidden`.
Keep `.shell.focus .content` the flex column it already is, and split the run into two children: a
card region at `flex: 1 1 auto; min-block-size: 0; overflow-y: auto`, and an action row at
`flex: 0 0 auto` sitting above `var(--app-safe-bottom)`. The card scrolls; the button never moves.
`min-block-size: 0` is the load-bearing line — without it the flex child refuses to shrink below its
content and you get exactly today's overflow back. Take the measure in the same pass: the run's
column is a flat 504px at every landscape width, so cap it with a `max-inline-size` that scales
instead of a fixed one.

Verify at **812x375, 844x390, 667x375 and 932x430, ten cold loads each** — the words differ, and a
traditional-form line adds 36px, which is why the failure is intermittent and why one load is not a
test. Every single load must satisfy `document.documentElement.scrollHeight === innerHeight` and
`primaryButton.getBoundingClientRect().bottom <= innerHeight`. Then re-check 375x812 portrait: the
run must still fill the frame with no internal scrollbar, and the answer row must still clear the
home indicator.
