# Architecture & UX Audit — 2026-09-22

_Audited on 2026-09-22 at commit `5b84ad9` with pre-existing working-tree changes · Scope: entire app · Live walkthrough: unavailable (the existing `127.0.0.1:5177` dev server returned HTTP 500, `EPERM` scanning `src`; no connected browser surface)_

_Previous audit: none_

Tick a box when its recommendation is implemented. The checkbox is the single source of truth for that item; the sections after the list only reference IDs.

## Summary

| Priority | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 1     |
| Medium   | 4     |
| Low      | 0     |

The five HSK levels and two core activities are reachable without authentication. The compact, contextual navigation fits this small route tree. The main structural weakness is that a learner's quiz position and results exist only in a mounted component, while individual answers already persist.

## Current State

### Sitemap

```text
/                         Choose HSK 1–5; progress and reset. Entry point.
├── /browse/[level]       Browse/search/filter a level; reached from each level card,
│                         the results page, and the error page. [level] is 1–5.
│   └── word sheet        In-page dialog; reached from a word row. Its history entry
│                         lets browser Back close the sheet.
└── /quiz/[level]         Ten-card practice session; reached from each level card,
                          browse bar or word sheet, and the error page. [level] is 1–5.
    └── results           In-place view at the same URL; offers another run, review,
                          browse, and all levels. ?state=summary is a demo preview,
                          not a saved real result.

+error.svelte              Recovery for invalid levels, unknown routes, and errors.
```

The route tree is defined by `src/routes/+page.svelte`, `src/routes/browse/[level]/+page.svelte`, and `src/routes/quiz/[level]/+page.svelte`. All eleven intended concrete pages (home plus five browse and five quiz pages) have an inbound link from home. There are no auth gates or load redirects. `loadLevel` shares cached and in-flight vocabulary loads (`src/lib/data/index.ts:19-56`).

### Navigation

- **Primary:** Each level card offers Browse and Practise (`src/lib/components/levels/LevelCard.svelte:215-230,309-318`). The home page features one starting or returning level (`src/routes/+page.svelte:94-108`).
- **Contextual:** The shared app bar offers Back on browse and quiz, plus Practise on browse (`src/lib/components/shell/AppBar.svelte:119-164`). Back pops in-app history or replaces a cold deep link with home (`src/lib/components/shell/AppBar.svelte:86-100`).
- **Within browse:** A five-level switch marks the current page with `aria-current` (`src/lib/components/browse/LevelSwitch.svelte:26-38`); status filters use `aria-pressed` (`src/lib/components/browse/StatusFilter.svelte:124-149`). Empty search can carry `?q=` to a matching level (`src/routes/browse/[level]/+page.svelte:727-786`).
- **Secondary and footer:** Results link to the current level's vocabulary and all levels (`src/lib/components/summary/SessionSummary.svelte:937-947`). The footer contains attribution links, not product destinations (`src/lib/components/shell/SiteFooter.svelte:10-24`). There is no separate mobile tab bar or side navigation.

### Primary Flows

1. **Start or continue practice:** `/` → featured or chosen level's Practise → lazy vocabulary load → ten introductions/questions → in-place results → another run, review, browse, or all levels (`src/routes/quiz/[level]/+page.svelte:135-189,206-246,332-337`). Answers are recorded immediately. Refreshing or re-entering `/quiz/[level]` builds a new random session; a finished real result also disappears.
2. **Look up a word:** `/` → Browse → level switch, search, and status filter → word sheet → optional Practise of that word (`src/routes/browse/[level]/+page.svelte:68-139,446-470`; `src/lib/components/browse/WordSheet.svelte:656-658`). The sheet uses a history entry so Back closes it. A typed query is local state unless received through `?q=`; the level switch intentionally clears it.
3. **Recover:** Vocabulary load failure offers retry and all levels (`src/routes/browse/[level]/+page.svelte:657-675`; `src/routes/quiz/[level]/+page.svelte:300-319`). Invalid levels and unknown routes use the shared error page with level choices (`src/routes/+error.svelte:22-77`).

## Recommendations

- [x] **AR-01 — Restore an interrupted quiz and its result** · done 2026-09-22 · Priority: **High** · Effort: L
  - **Issue:** `/quiz/[level]` creates a random session in a component effect, while each answer is recorded immediately. Refresh, history re-entry, or leaving results for Browse and returning creates a different run, losing the learner's position or result (`src/routes/quiz/[level]/+page.svelte:135-189,206-246,332-337`; `src/lib/components/summary/SessionSummary.svelte:937-947`).
  - **Why it matters:** A common interruption can replace the task in progress, and already-recorded answers cannot reconstruct the same question sequence or summary.
  - **Recommendation:** Save a versioned active-session snapshot for the current level (question and choice IDs, answers, index, and finished state) in browser session storage; restore it on re-entry after validating it against the loaded vocabulary. Distinguish explicit “another run” from resume, and clear or replace the snapshot only when the learner starts a new run. Keep the existing per-word progress writes and demo-preview behavior.
  - **Expected benefit:** Refresh and Back return to the same question or real result without replaying progress writes.
  - **Files:** `src/routes/quiz/[level]/+page.svelte`, `src/lib/session/index.ts`, `src/lib/components/summary/SessionSummary.svelte`, `src/lib/session/session.spec.ts`
  - **Depends on:** —

- [x] **AR-02 — Keep the search shortcut inside the active modal** · done 2026-09-22 · Priority: **Medium** · Effort: S
  - **Issue:** Browse's document-wide `/` shortcut focuses the search field behind an open `aria-modal` word sheet; the sheet's keyboard handler only contains Tab and Escape within its panel (`src/lib/components/browse/SearchField.svelte:34-49`; `src/lib/components/browse/WordSheet.svelte:335-394`).
  - **Why it matters:** Keyboard focus can leave the visible dialog, contradicting its modal state and disorienting keyboard and screen-reader users.
  - **Recommendation:** Disable the search shortcut while the word sheet is open, or scope it to events outside any active modal; verify focus remains in the sheet after `/` and returns to the opener on close.
  - **Expected benefit:** Modal keyboard behavior remains predictable.
  - **Files:** `src/lib/components/browse/SearchField.svelte`, `src/routes/browse/[level]/+page.svelte`
  - **Depends on:** —

- [x] **AR-03 — Announce vocabulary loading** · done 2026-09-22 · Priority: **Medium** · Effort: S
  - **Issue:** Browse and quiz render only `aria-hidden` skeletons while a level chunk loads (`src/routes/browse/[level]/+page.svelte:718-726`; `src/routes/quiz/[level]/+page.svelte:320-331`).
  - **Why it matters:** Assistive technology reaches an apparently empty main region during a core transition, with no indication that content is coming.
  - **Recommendation:** Add a concise loading message with status semantics on both routes while retaining the visual skeletons, then let the loaded content or existing error state replace it.
  - **Expected benefit:** The transition has clear feedback for screen-reader users.
  - **Files:** `src/routes/browse/[level]/+page.svelte`, `src/routes/quiz/[level]/+page.svelte`
  - **Depends on:** —

- [x] **AR-04 — Make browse failure copy reflect storage state** · done 2026-09-22 · Priority: **Medium** · Effort: S
  - **Issue:** Browse always claims practised progress is kept on this device when the vocabulary chunk fails, even if local storage is unavailable or writes have failed (`src/routes/browse/[level]/+page.svelte:657-675`). The quiz's matching failure state already conditions this reassurance on `progress.status` (`src/routes/quiz/[level]/+page.svelte:300-310`).
  - **Why it matters:** A recovery screen can give a false promise about learner data at the moment reliability matters most.
  - **Recommendation:** Use the same conditional storage copy as quiz, with a neutral network-retry message in other storage states.
  - **Expected benefit:** Recovery guidance stays accurate and consistent across the two core routes.
  - **Files:** `src/routes/browse/[level]/+page.svelte`
  - **Depends on:** —

- [ ] **AR-05 — Give each level one route identity** · Priority: **Medium** · Effort: M
  - **Issue:** The browse, quiz, and shell parsers coerce level segments with `Number()`, so aliases such as `/quiz/01` and `/browse/1.0` can display level 1 under duplicate URLs. The shell also ignores extra path segments when assigning mode, so a 404 such as `/quiz/1/extra` gets quiz chrome and hides the footer (`src/lib/components/quiz/quiz.ts:321-324`; `src/routes/browse/[level]/+page.svelte:68-76`; `src/lib/components/shell/route.ts:60-103`; `src/routes/+layout.svelte:177,239-263`).
  - **Why it matters:** Bookmarks and canonical tags can name the same content differently, and an unknown path can look like a valid quiz page around its error content.
  - **Recommendation:** Parse only exact `1`–`5` segments through one shared helper, use it for both route validation and shell mode selection, and require the expected segment count. Let malformed paths show the existing recovery page with neutral error chrome.
  - **Expected benefit:** One address per level and a consistent 404 presentation.
  - **Files:** `src/lib/components/shell/route.ts`, `src/lib/components/quiz/quiz.ts`, `src/routes/browse/[level]/+page.svelte`, `src/routes/quiz/[level]/+page.svelte`, `src/routes/+error.svelte`
  - **Depends on:** —

## Top 5

1. AR-01 — Resume the actual question sequence and preserve finished results after interruption.
2. AR-02 — Keep keyboard focus inside the word sheet.
3. AR-03 — Make both lazy-loading transitions understandable to assistive technology.
4. AR-04 — Remove an inaccurate promise from browse's error recovery.
5. AR-05 — Make level URLs and error chrome agree on what route exists.

## Quick Wins

None meet the Critical/High plus S-effort threshold. AR-02, AR-03, and AR-04 are small Medium-priority changes.

## Larger Architectural Improvements

- AR-01 — A recoverable quiz lifecycle, including a real finished result.
- AR-05 — A shared, exact route identity across page and shell logic.

## Risks If the Current Structure Is Kept

- Learners who refresh or follow Browse from a result cannot return to their actual run, while recorded progress remains changed.
- The modal shortcut, silent loading states, and inaccurate recovery copy continue to create confusing states for keyboard and assistive-technology users.
- Loose path parsing leaves duplicate level addresses and mismatched chrome on unknown paths as the route tree grows.

## Recommended Information Architecture

The current IA is sound; no restructuring is recommended. Keep level selection as the hub, with Browse and Practise scoped to a chosen HSK level, and preserve the contextual app bar. Repair state continuity and route identity within that structure.
