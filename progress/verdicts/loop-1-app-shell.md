# Verdict — app-shell, loop 1

**Result: FAIL.** One `fail`, four `major`, five `minor`. The shell has a real point of view and
beat the reference in a blind comparison — but it ships a factual error about its own subject,
a back button that lies to the OS, two headingless main screens, and no way onto a home screen.

## Blind design judge — we won

`progress/blind/loop-1/app-shell/mapping.json`: **A = reference** (Du Chinese Articles list,
`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png`), **B = ours**
(`progress/shots/loop-1/app-shell-mobile.png`). The judge picked **B**, gap "moderate":

> "B is the one where someone clearly made decisions; A is competent template assembly."

It named our five-step type scale, the 48pt 词汇练习 with pinyin beneath it, the 一/二 stroke
glyphs in the red tile ("simultaneously brand, icon, and content — that is a designed idea"),
single-accent discipline, and the shared right margin for stats. **The `whatWeakerMustChange`
list is aimed at Du Chinese, not at us. Do not act on it.** Do not manufacture a deficit here:
the level-select frame is above the bar.

The judge's three criticisms *of ours* are the only part of that block we own, and they are real:
the black primary button is disconnected from the red brand accent; "Not practised yet" appears
three times on one screen; the empty progress bars are noise at zero state. All visible in
`app-shell-mobile.png`.

## Surviving findings

### 1. FAIL — the home screen states word counts that contradict the ground truth

`app-shell-mobile.png` / `app-shell-desktop.png`: hero reads "4,307 words, five levels"; cards read
500 / 769 / 969 / 999 / 1070. Official standard is 4,316 and 500 / 772 / 973 / 1000 / 1071.
Confirmed by counting both sides: `src/lib/data/hsk{1..5}.json` vs
`reference/hsk/hsk30-official-L{1..5}.json`. **Nine words are missing and unreachable — a learner
can never practise them.** `reference/hsk/README.md`: "A level whose count differs from this table
is wrong."

Ownership note: the shell is honest here. `src/routes/+page.svelte:51` reads `SHIPPED_TOTAL` from
`src/lib/data/sizes.ts`, which mirrors what actually shipped. The defect is in the vocab build
(`scripts/build-vocab.mjs`), and `src/lib/data/vocab.spec.ts:49` already asserts "accounts for all
4,316 official entries". Fix it there; it is not the shell's to fix, but it is on the shell's face.

### 2. MAJOR — the back chevron pushes; it does not pop

`src/lib/components/shell/AppBar.svelte` renders
`<a class="icon" href={resolve('/')} aria-label="Back to levels">` — no `replaceState`, no
history awareness, so the stack only grows. Scripted at 375x812: `/` → Browse → `/browse/1` →
Practise → `/quiz/1` (history.length 4); tapping back gives `/` at history.length **5**. One OS
swipe-back from there lands you in `/quiz/1` — the quiz you just abandoned. On iOS the swipe is
the primary back gesture, so the visible arrow and the system disagree about where "back" is.

### 3. MAJOR — 202px of permanent chrome on /browse, and nothing at frame level owns it

`app-shell-scrolled-mobile.png`, taken at `scrollY = 400`: the level pills, search field and
All/New chips sit in exactly the same place as unscrolled, and the first word row (白 bái) starts
at y≈202 CSS px — a quarter of an 812px phone, before the first word. The shell adds 57px
unconditionally; the screen stacks ~145px under it; neither collapses. Reference:
`reference/screenshots/duchinese/ui/duchinese-iphone-07-ui.png` nav bar ≈95px with content
immediately below; `reference/screenshots/pleco/pleco-iphone-01.png` search bar ≈72px with result
rows at once. We are ~2.8x Pleco on the screen with a 38,402px document.

### 4. MAJOR — /quiz/[level] and /browse/[level] contain zero headings

`[...document.querySelectorAll('h1,h2,h3')]` returns `[]` on `/quiz/1`, `/browse/1` and `/browse/5`
at 320px and 375px. Confirmed in source: the only `h1`/`h2` in those two routes are inside error and
empty-state panels (`quiz/[level]/+page.svelte:209,228,239`; `browse/[level]/+page.svelte:397,415,462`)
— never the normal state. The cause is the shell: `AppBar.svelte` renders the page name as
`<span class="heading">`. The app is inconsistent with itself — `/` has an H1 plus per-card H2s,
and `/quiz/1?state=summary` has an H1, so only the two shell-titled routes are unstructured.

### 5. MAJOR — not installable; the safe-area token system is therefore dead weight

`ls static/` returns `.assetsignore` and `robots.txt` only. `src/app.html` has no
`link[rel=manifest]`, no `link[rel=apple-touch-icon]`, no `apple-mobile-web-app-*` meta — the sole
icon is an inline `data:image/svg+xml` favicon, which iOS ignores for Add to Home Screen. So
`viewport-fit=cover` and the entire `--app-safe-*` set the shell built resolve to 0px in a normal
Safari tab and pay off only in standalone. Pleco and Du Chinese are both a tapped icon; this is a
URL you have to remember.

### 6. MINOR (evidence understates it) — landscape quiz hides every answer

`app-shell-quiz-landscape.png` at 812x375: `scrollHeight` 708 against `innerHeight` 375. The shot
shows the hanzi and "Show pinyin" filling the viewport with **no answer button visible at all** —
the learner is asked to choose between options that are entirely below the fold. Contradicts the
shell's own documented promise in `+layout.svelte` that a run is "exactly one viewport tall".
Fits correctly at 375x667 and 375x812.

### 7. MINOR — the desktop bar is full-bleed against a centred column

`app-shell-quiz-desktop.png` at 1440x900: chevron centre x≈41, answer column left edge x≈470,
column centre x≈720; the bar's right two-thirds is empty. Same in `app-shell-desktop.png` (wordmark
x≈45, content column starts x≈284). Reads as a phone app stretched.

### 8. MINOR (corrected) — the 汉 mark in the bar is untagged; the hero is fine

The critic's claim that the home hero lacks a `zh-Hans` ancestor is **false**:
`src/routes/+page.svelte:86` is `<h1 ... lang="zh-Hans">词汇练习</h1>`. What is untagged is the
first hanzi leaf on the page — `<span class="mark" aria-hidden="true">汉</span>` in `AppBar.svelte`,
which is rendered on every screen. Tag it `lang="zh-Hans"`.

### 9. MINOR — head stops one tag short

`meta[property="og:image"]` null and `link[rel=canonical]` null, while og:title, og:description and
two theme-color metas are present. A shared link renders as a text-only card.

## Biggest gap

**Give the shell a scroll-direction chrome controller and hold total chrome under ~100px on
/browse.** Today `AppBar.svelte` only tracks `scrolled > 2` to toggle a hairline, and each screen
stacks its own sticky toolbar underneath with no knowledge of the total — 202px of permanent chrome
against Du Chinese's 95px and Pleco's 72px, on a 38,402px-tall list.

Concretely: in the shell, derive scroll *direction* (not just offset) and expose it — a
`data-chrome="expanded|condensed"` attribute on `.shell` plus a `--app-chrome-h` custom property
that always reports the live total. On scroll-down past ~80px, translate the 57px bar off the top
and set `--app-chrome-h` to 0; on scroll-up or at rest, bring it back. Then make
`browse/[level]/+page.svelte` subscribe: its sticky toolbar sticks to `--app-chrome-h` instead of a
hard-coded offset, and in the condensed state it collapses the level pills and the All/New chips
into the search row (pills become a compact chevron control on the row's left, the counts move into
the field's placeholder), leaving a single ~64px bar. Target: first word row above y≈100 while
scrolling, full toolbar returning the instant the user scrolls up — the Pleco/Du Chinese behaviour
the shell is currently measured against and losing to by ~3x.
