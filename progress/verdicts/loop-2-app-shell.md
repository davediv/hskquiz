# Verdict — app-shell, loop 2

**PASS: no.** The shell looks better than the reference and behaves worse than it.

## Blind design judge

The judge picked **B — ours — over the Du Chinese articles screen, gap "large"** (loop 1 was
also B, gap "moderate", so the visual gap widened in our favour). Mapping:
`progress/blind/loop-2/app-shell/mapping.json` — A = reference
(`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`), B = ours
(`progress/shots/loop-2/app-shell-mobile.png`).

It called ours "the only one of the two that looks authored", crediting the ~6x type ladder,
hanzi at display scale as the subject, a single crimson accent used four times for related
meaning, and the filled-vs-outlined CTA decision between card one and card two. Its
`whatWeakerMustChange` list is addressed to **the reference**, not to us — there is no design
instruction to inherit from it. **Do not manufacture a visual deficit this loop.** Its only two
criticisms of ours were the bare underlined "Browse" link (no padded hit area) and a first fold
spent on prose including the developer-ish "8 pairs of same-pinyin homographs share a card".

Visual design is not this piece's problem. Every finding below is behaviour.

## Surviving findings

### Major

**1. The bar retracts to nothing, and takes the skip link off-screen with it.**
`chrome.svelte.ts:230` computes `visible = barH - hidden` while `hidden` is allowed to reach
`barH + fold` (`:171`, `:197`), so `--app-header-h` goes negative and `--app-chrome-h` with it —
measured `calc(0px + -54px)` on `/browse/1`. `+layout.svelte:153` pins `.skip` at
`calc(var(--app-chrome-h) + 0.5rem)`, so the first tab stop on every page lands at top **-46**,
bottom **-4**: a focused element wholly outside the viewport, and the one affordance that exists
solely for keyboard users. Shot: `progress/shots/loop-2/app-shell-skiplink-condensed-mobile.png`
(a ~2px red sliver at the frame's top edge). This contradicts the shell's own doc at
`shell.css:18` ("0 → --app-bar-h") and `:23` ("the one number that answers how much of the
viewport is not mine").

**2. Zero navigation on screen once the bar is gone.**
`progress/shots/loop-2/app-shell-browse-scrolled-mobile.png` (375x812, scrollY 400) contains a
search field, All/New chips and word rows — no back chevron, no "HSK 1 vocabulary", nothing
naming the level, on a 38,402px document. The shell's own header comment argues against a bottom
tab bar on the grounds that "a contextual top bar" *is* the navigation, then hides that bar.
Du Chinese keeps a bottom tab bar pinned regardless of scroll
(`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`); Pleco keeps a permanent ~72px
band (`reference/screenshots/pleco/pleco-iphone-01.png`).

**3. Not installable — loop-1 finding 5 is still open.**
`ls static/` → `.assetsignore`, `robots.txt`. `grep -rn 'manifest|apple-touch-icon' src/ static/`
→ nothing. What loop 2 added were the metas that only pay off *after* install
(`mobile-web-app-capable`, `apple-mobile-web-app-*`), while the manifest and apple-touch-icon
that make install possible were skipped. `src/app.html`'s own comment claims home-screen launch
is "the whole point of the safe-area token system the shell carries" — the head does not deliver
the tap target that comment depends on.

**4. Landscape quiz still hides three of four answers — loop-1 finding 6 is still open.**
`progress/shots/loop-2/app-shell-quiz-landscape.png` at 812x375: bar, 1/10 rail, 送, "Show
pinyin", answer 1, and the top edge of answer 2. `scrollHeight` 590 vs `innerHeight` 375 —
improved from loop 1's 708, still 215px over, and the 812px of width goes unused because content
stays in a 544px centred column. `+layout.svelte`'s comment claims the flex column "is what lets
the run be exactly one viewport tall".

### Minor

**5. `og:image` still null** — loop-1 finding 9 half-closed. Canonical and `og:url` work;
`twitter:card` is still `summary`, so a shared link is a text-only card.

**6. Published bar height off by one, and a 1px sliver never leaves.** `AppBar.svelte:63` binds
`clientHeight` on `.inner`, which excludes the header's own `border-block-end` (`:111`), so
`--app-header-h` publishes 56 while the `<header>` border-box measures 57 on all four routes.
Condensed, the bar sits top -56 / bottom **+1**.

**7. The bar's `<h1>` outranks the page on `/quiz/1?state=summary`.** Headings there are
`['H1:HSK 1', 'H2:HSK 1 session complete…', 'H3:3 words to review']` — the shell takes the
document's only H1 on the one route where the page has something more specific to say. On
`/quiz/1` and `/browse/1` the same mechanism is the loop-1 fix working correctly.

## Biggest gap

**Give the bar a floor: it must never retract past a compact, permanently-docked row carrying
the back control and the level title.** Change `chrome.svelte.ts` so `hidden` is clamped to
`barH - MIN_BAR` (target `MIN_BAR` ≈ 40px, enough for a 44px-ish tap target on the back control
plus the title at reduced size) instead of being allowed to reach `barH + fold`, and make
`visible` return `Math.max(MIN_BAR, barH - hidden)` so `--app-header-h` can never be negative.
Keep the fold feature, but implement it as an offset a screen applies to *its own* sticky block —
never by driving the shell's published chrome number below zero, which is what
`shell.css:18`/`:23` promise it cannot do. While in there, measure the `<header>` border-box
rather than `.inner` at `AppBar.svelte:63` so the published number stops under-shooting by the
1px border.

One change closes three findings: the skip link comes back on screen with no separate patch
(finding 1), the learner always has a way back and always knows which level they are in
(finding 2), and the 1px sliver becomes an intentional docked bar instead of an accident
(finding 6). It also settles the contradiction the shell argues itself into — Du Chinese and
Pleco both keep permanent chrome, and our own header comment already claims the top bar is the
navigation. Verify at 375x812 on `/browse/1` scrolled to 600: the frame contains the back control
and "HSK 1 vocabulary"; `.skip.focus()` yields `rect.top >= 0`; and
`getComputedStyle(shell).getPropertyValue('--app-chrome-h')` resolves non-negative on `/`,
`/quiz/1`, `/browse/1` and `/quiz/1?state=summary`.
