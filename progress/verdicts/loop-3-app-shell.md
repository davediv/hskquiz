# Verdict — app-shell, loop 3

**PASS: no.** Loop 2's biggest gap is genuinely closed — the bar now has a floor, the skip link is
back on screen, the app is installable, the share card is real. But the shell still fails the one
motion the whole product is built around: leave level select, do a session, come back. It throws
the learner to the top of a 2,054px list every single time. That is a `fail`-severity behaviour on
the app's core loop, and it did not exist as a named finding before loop 3 measured it.

## Blind design judge — we won, again, by a large margin

Ours was **B** (`progress/shots/loop-3/app-shell-mobile.png`); the reference was **A**
(`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`). Mapping:
`progress/blind/loop-3/app-shell/mapping.json`. The judge picked **B**, gap size **large** — the
same result and the same margin as loop 2, so the visual lead held while behaviour was being
worked on.

> "B looks authored; A looks assembled from platform defaults… B makes the language the subject:
> 词汇练习 is the largest object on the page… A is a Chinese-learning screen with no Chinese on it."

Its `whatWeakerMustChange` list — put hanzi on the cards, build a real type ramp, cut to one
accent, impose an 8px scale, give the back arrow a 44x44 hit area — is **addressed to Du Chinese,
not to us**. There is nothing to import from it and nothing is manufactured below. Two of its
asides are worth carrying anyway, because they arrive unprompted from a judge that did not know
whose screen it was: the five level cards are "near-identical blocks… five of them will read as
monotonous repetition down the scroll", and the ~15px grey glosses ("thank you", "0 of 500
practised") sit around #8a8a8a and are "borderline on contrast". Both belong to level-select, not
to the shell.

**Every finding below is behaviour.** The shell's problem this loop is not how it looks.

## What is verified closed

Loop 2's findings 1, 2, 3, 5 and 6 are closed, and closed in the running app rather than on trust:
`--app-header-h` now travels 57px → 41px and never lower; `--app-chrome-h` resolves non-negative on
`/`, `/quiz/1`, `/browse/1` and `/quiz/1?state=summary`; `.skip.focus()` at scrollY 600 lands at
top 49 instead of loop-2's -46; the docked row visibly carries the chevron, "HSK 1 vocabulary" and
"Practise" (`progress/shots/loop-3/app-shell-browse-condensed-mobile.png`); the header border box
measures 57 and publishes 57; manifest, apple-touch-icon and the 192/512/maskable icons all serve
200; `twitter:card` is `summary_large_image` with an absolute `og:image`. No horizontal scroll at
375/320/812. Zero console errors on any route.

## Surviving findings

### Fail

**1. Level select loses your scroll position on every back navigation — 5/5 reproducible, and it
is not the browser.**
Leave `/` at scrollY 900 (looking at HSK 4/5, which are below the fold on a 375x812 phone), tap
Practise, press Back → you land at **114**. Exit via Browse instead → you land at **31**. In the
identical harness, `/browse/1` left at 1200 comes back at exactly **1200**, so both the browser's
restoration and SvelteKit's work fine; something on the home route is stomping the restored offset
and never re-applying it. It is not a settling transient — the critic re-measured at back+80ms and
back+2500ms and got 114 both times. So the app's single most-repeated loop makes an HSK 4 or 5
learner re-scroll ~900px of a 2,054px document after **every** session. Pleco and Du Chinese both
return you to where you were.

The mechanism is visible in the code: `/browse/1` publishes its full document height from the
windowing maths (`browse/[level]/+page.svelte:629`, `style:block-size={win.totalHeight}`), so the
document is its final height when the offset is applied. `/` has no such handle — its height comes
entirely from measured card content, and `+page.svelte:34-40` holds every progress-driven value
back behind `hydrated`, so the document changes size after the restore has already been clamped.
Landing at 31 and 114 — both a hair under one viewport of scroll — is exactly what a clamp against
a document that has not grown yet looks like.

### Major

**2. Landscape quiz still does not fit, and now the only control is the thing that is cut off.**
Loop-2 finding 4 is improved, not closed. At 812x375 `.shell` renders **415px tall in a 375px
viewport**, and the sole button, "Got it", occupies y361→407 — 32 of its 45px are below the fold.
`progress/shots/loop-3/app-shell-quiz-landscape2.png` shows only the top rounded sliver of the
black pill. It is a constant, not a rounding error: `.run` measures **h368 at 812x375, at 844x390
and at 667x375**, so the run has a hard 368px floor that ignores viewport height entirely.
`+layout.svelte`'s own comment claims the flex column "is what lets the run be exactly one viewport
tall"; it is 40px over on every landscape phone. The 812px of width also still goes unused — the
progress rail spans x155–665, a ~510px column with ~150px dead on each side, which is the exact
complaint loop 2 made.

**3. A cold open of `/browse/1` spends more chrome than the number the shell's own header names as
the failure it exists to fix.**
`chrome.svelte.ts` says browse's total "was 208px: a quarter of an iPhone frame… Pleco spends 72px
on the same job and Du Chinese 95px." Measured at scrollY 0 on a 375x812 phone, the sticky stack
(57px bar + level pills + search field + All/New chips + divider) ends at **y=220** — 27.1% of the
frame before 爱, the first word of 500. See `progress/shots/loop-3/app-shell-browse-atrest-mobile.png`.
The controller only claws it back to 150px after a downward scroll, and 150px is still 2.1x Pleco
and 1.6x Du Chinese. The scroll-direction controller was built to solve this number and left the
at-rest number 12px worse than it found it.

### Minor

**4. The docked back control is 44x40 — under the 44x44 minimum, in the exact state the floor was
added to protect.** Expanded the anchor measures 44x44; condensed (scrollY 1200) it measures
**44x40**, because the row it lives in is 40px and the anchor fills it. `chrome.svelte.ts`'s comment
claims 40px "still fits a 44px-wide tap target on the chevron" — true of the width, not of the
height.

**5. The bar's `<h1>` still outranks the page on `/quiz/1?state=summary`.** Loop-2 finding 7,
unchanged. The outline reads `H1:HSK 1`, `H2:HSK 1 session complete — 7 of 10 correct`,
`H3:3 words to review` — the shell takes the document's only H1 on the one route where the page has
something more specific to say. The H3's accessible name also carries raw template whitespace:
`"3\n\t\t\t\t\t\twords to review"`.

**6. `shell.css` documents an override that does not exist.** Its contract block promises "One
transitional exception, spelled out and dated in `+layout.svelte`: inside `#main` it currently
resolves to `--app-sticky-top`". Verified: `grep -rn -- "--app-header-h:" src/` returns exactly one
line, `shell.css:97`, the `:root` default. Browse already sticks to `top: var(--app-sticky-top)`
directly (`browse/[level]/+page.svelte:721`). In a shell whose comments are written as the spec, a
comment describing a live exception that was already removed sends the next builder looking for a
file that says nothing of the kind.

## Biggest gap

**Make `/` come back to where the learner left it, the way `/browse/1` already does.** Record
`window.scrollY` per history entry in `+layout.svelte` — capture it in `beforeNavigate` against
`page.url.href`, keyed so a forward push and a pop read the same slot — and re-apply it on the home
route *after the screen has reached its final height*, not on the frame the router restores in.
Re-applying once in `afterNavigate` is not enough and is probably what is already failing: home's
document only reaches 2,054px once `hydrated` flips at `+page.svelte:34-40` and the progress strip
and per-card rails render, so the restore is being clamped against a document roughly one viewport
tall — which is exactly what landing at 31 and 114 means. Re-apply on the second animation frame
**and** again from a `ResizeObserver` on the content wrapper until the target offset is reachable
(`document.documentElement.scrollHeight - innerHeight >= target`), then disconnect. The cheaper
alternative, if you would rather not own a scroll manager: give `/` a stable height before
hydration the way browse does — reserve the progress strip's box and the per-card rail whether or
not there is progress yet — so the browser's own restoration has a document to land in. Either
route, do not paper over it with `scroll-behavior: smooth` or a `scrollIntoView`; both make the
jump visible instead of absent.

Verify at 375x812: scroll `/` to 900, tap Practise on HSK 4, press Back, and land at 900 with HSK
4's card in the same place — three cold runs in a row, then once more exiting via BROWSE, then once
more with progress seeded so the strip is present. `/browse/1` at 1200 must still return to 1200.

This is the app's core loop, and it is the one thing Pleco and Du Chinese never make you do.
