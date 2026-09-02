# app-shell — loop 6 verdict

**PASS: no.** The shell's craft is real and improving, but the one screen the shell alone owns —
the error frame — is still unmodified SvelteKit scaffold. A frame that has never been built cannot
be at the standard of the reference apps.

## Blind design judge: preferred OURS

The mapping (`progress/blind/loop-6/app-shell/mapping.json`) makes ours **B**. The judge chose **B**,
gap size **large**, and its ten-item `whatWeakerMustChange` list is addressed to Du Chinese, not to
us. Its summary of us: "B looks decided; A looks assembled from defaults" — hanzi at the top of the
type scale twice, a committed warm paper ground with a single crimson accent used in exactly three
places, letterspaced uppercase micro-labels as a consistent metadata voice, and a hard-stepping
scale (20 → 36 → 16 → 11). **No deficit to manufacture here.** Two real defects it named inside our
system are worth carrying, though both belong to design-system rather than app-shell: the tone-colour
ramp is undisciplined (five-plus hues at uneven chroma, tone-2 green sitting around **3:1** on the
paper ground — an actual contrast failure), and the gloss column is ragged.

## Surviving findings

### 1. FAIL — the error frame is un-built scaffold, and has no `main` landmark

`find src -name '+error*'` returns nothing. `/nope` renders an `h1` "404" and "Not Found" flush at
x=0 with no page gutter, no route back into the app, and the generic `<title>hskquiz</title>`.
Because `+layout.svelte:83-84,244` deliberately renders `<div id="main">` and delegates the `<main>`
landmark to each screen, and the framework error page is not a screen, the 404 document has **zero
main landmark** — verified live: `curl` on `/nope` returns `<main>` count **0**, while every real
route returns 1.

The sibling case makes it worse: `/browse/9` gets a fully designed screen — "NOT A LEVEL" eyebrow,
"hskquiz covers HSK 1 to 5", a sentence naming the bad value, five HSK chips and a "Back to levels"
pill. The shell handled the wrong *level* and left the wrong *URL* to the framework.

Evidence: `progress/shots/loop-6/app-shell-404-mobile.png` against
`progress/shots/loop-6/app-shell-badlevel-mobile.png`.

### 2. MAJOR — soft 404s, and a 404 that declares itself canonical

Verified live by raw HTTP, not screenshot:

| URL | status | `<main>` | canonical |
|---|---|---|---|
| `/browse/9` | **200** | 1 | `…/browse/9` |
| `/quiz/9` | **200** | 1 | `…/quiz/9` |
| `/nope` | 404 | **0** | `…/nope` |

No `error(` call exists anywhere under `src/routes`. Every `/browse/<any integer>` is an indexable
page whose head points search engines at the bogus URL as its own canonical version. **Beyond what
the critic caught:** `+layout.svelte:174,214` emits the canonical unconditionally, so even the
correctly-404ing `/nope` advertises itself as canonical.

### 3. MAJOR — the 22% chrome ceiling is not enforced at rest, only after a scroll

`CHROME_CEILING = 0.22` (`chrome.svelte.ts:118`). At rest on `/browse/1`, three of four named
viewports are over it and the shell says so and does nothing — `data-chrome-fit="over"` with
`--app-fold-h: 0px`:

- 812×375 → 105/375 = **28.0%** (over by 23px)
- 844×390 → 105/390 = **26.9%** (over by 19px)
- 932×430 → 105/430 = **24.4%** (over by 10px)
- 375×812 portrait → 14.2%, passes

One scroll gesture and the machinery works perfectly (fold 27.5px → 18.0% / 17.3% / 15.7%). Loop 5's
verification sentence was explicit: "≤ 22% at rest — not only when docked". The controller's own
comment agrees: "the ceiling is about what is on screen when it has not [moved]".
`progress/shots/loop-6/app-shell-browse-landscape-812x375.png`.

### 4. MINOR — landscape content column frozen at 544px for a third loop

`--container-app: 34rem` (`layout.css:476`) resolves to 544px at 812×375, 844×390 **and** 932×430 —
one number for three widths. Loop 4 asked for a max-inline-size that scales; loop 5 found 504 → 544
and still fixed; loop 6 finds 544 unchanged. At 932×430 that strands 388px (42% of the width) as
empty margin on the screen whose *vertical* axis is the binding constraint.

### 5. MINOR — quiz back chevron off its column in landscape (*downgraded from the critic's major*)

Measured left-edge of chevron vs `main` on `/quiz/1`: 812×375 → 8 vs 134; 844×390 → 8 vs 150;
932×430 → 8 vs 194; at 1024 and 1440 it lands on the column. Visible in
`progress/shots/loop-6/app-shell-quiz-landscape-812x375.png`.

**This is not the neglect the critic described.** `AppBar.svelte:478-487` documents the decision
explicitly: the chevron *was* aligned to the column, and doing so "printed the 44px pill straight
through '1/10' at 812x375" — the run's own progress rail starts at that column edge, which the
screenshot confirms. A full-frame exit was deliberately given the frame's corner. The visual cost is
real, but the fix is not "align it to the column" — that regresses a known collision. It is finding
#4: widen the column so the dead margin the chevron floats in stops existing.

### 6. MINOR — home bar spends 57px on a non-interactive restatement

On `/` at 375×812: header height 57, `innerText` "汉\nhskquiz",
`header.querySelectorAll('a,button,input,[tabindex]').length === 0`, and the `h1` 8px below names the
product again in Chinese (词汇练习, top 65). Pleco spends that row on a live search field; Du Chinese
on back + title. The loop-4 retraction fix is verified working (at scrollY 900 the header measures
top −57 / bottom 0, `--app-header-h` → 0px) — this is only about what a cold visitor sees at rest.
`progress/shots/loop-6/app-shell-mobile.png`.

### 7. MINOR — browse level pills spell a filter change as a navigation

From `/browse/1`, clicking `/browse/4` then `/browse/5` takes `history.length` 3 → 4 → 5, and the
bar's chevron `aria-label` walks "Back to levels" → "Back to HSK 1 vocabulary" → "Back to HSK 4
vocabulary". Three back-taps to leave a screen visited once.

### Dropped — "no `<nav>` landmark anywhere"

**Factually incorrect.** `LevelSwitch.svelte:26` renders `<nav class="switch" aria-label="HSK
level">` and is mounted on browse at `browse/[level]/+page.svelte:713`; `SessionSummary.svelte:962`
renders `<nav class="index" aria-label="The N words in this list">`. Live `curl` on `/browse/1`
returns one `<nav>`. The LevelSwitch nav was committed at 17:44 (c403206), three minutes before the
17:47 captures, so it was present when measured. The narrower true statement — there is no
*persistent global* nav, and `/` and `/quiz/1` have none — survives, but a quiz app that hides
chrome to protect a focused run is making a defensible product choice, not carrying a defect.

## Biggest gap

**Build the error frame, in one pass, as a real screen rather than a framework fallback.**

Add `src/routes/+error.svelte` modelled directly on the "NOT A LEVEL" screen that already exists for
`/browse/9`: a real `<main>` element (the layout renders only `<div id="main">` and delegates the
landmark to each screen, so without this the 404 has no main landmark at all), the app's own content
gutter instead of text flush at x=0, an eyebrow and an `h1` in the product's voice, and the five HSK
chips plus a "Back to levels" pill so the page is a route back into the app rather than a dead end.
Give it a real title — "Page not found · hskquiz".

Then make the level routes call `error(404, …)` for a level outside 1–5, so `/browse/9` and `/quiz/9`
render that same designed screen *under* a 404 status. And gate the `<link rel="canonical">` /
`og:url` pair in `+layout.svelte:214-215` on the page being a real page — today even the correctly
-404ing `/nope` names itself canonical.

Verify with raw HTTP, not a screenshot: `/browse/9`, `/quiz/9` and `/nope` must all return **404**,
all three must render the designed screen, `document.querySelector('main')` must be non-null on each,
and none of the three may emit a self-referencing canonical.
