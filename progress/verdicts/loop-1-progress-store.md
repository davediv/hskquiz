# Verdict — progress-store (loop 1)

**PASS: no.**

The store is well-written code with a bad durability contract. The maths (`applyAnswer`, the tuple
wire format, the summaries) is clean and correct, the debounce/ceiling/pagehide design is the right
shape, and `detectStorage()` handles SSR and Safari private mode better than most. What fails is
everything around the write: a write is a **blind whole-blob overwrite** that can silently destroy
another tab's answers or an unreadable payload, and a **failed write is latched and invisible** —
the store knows it is not persisting and tells no one, while the home page keeps promising
"Progress is kept on this device."

Both the critic and an independent verifier reproduced this in a real browser against the dev
server. I re-read the source and re-derived every mechanism below; the verifier also found four
type-safety and correctness defects the critic missed, which I have folded in.

Worse than any single finding: **three of the defects are asserted as intended behaviour by the
test suite** (`src/lib/progress/progress.spec.ts`), so they ship green and would survive a refactor:

- `it('keeps the session alive when the quota is exceeded, and stops retrying')` — asserts
  `storage.writes === 0` after 5 s of further answers. The latch is a tested feature.
- `it('keeps unsaved local answers rather than losing them to another tab')` — asserts the local
  answer survives and never checks the other tab's answer, which is gone.
- `it('starts empty on corrupt JSON and repairs the key on the next write')` — "repairs" is the
  word the suite uses for overwriting the learner's unreadable history.

---

## Surviving findings, ranked

### 1. FAIL — One rejected `setItem` stops all scheduled writes; nothing retries
`#schedule()` opens with `if (!this.#storage || !this.#persistent) return;` and `flush()`'s catch
block sets `#dirty = false; #persistent = false;`. After a single throw, no mutation ever schedules
a write again. Verifier reproduction: Playwright on `/quiz/1` with `Storage.prototype.setItem`
patched to throw `QuotaExceededError` **exactly once**, then healthy — five keyboard-driven answers
later the key was still `null` and an instrumented counter showed `setItem` was attempted **once**.
The control run wrote `{"v":1,"w":{"L1-0248":…,"L1-0344":…,"L1-0420":…}}`. Unit-confirmed: after the
throw, 5 more `recordAnswer` + 3 s of fake timers = 0 writes. Evidence:
`progress/shots/loop-1/progress-store-quota-full-mobile.png`.

*Correction to the critic's wording:* not literally "for the rest of the page's life" — `flush()`
checks only `#storage`, so a later `pagehide` / `visibilitychange` / `resetLevel` / `resetAll` flush
both writes and flips `#persistent` back to true. The substance stands: **no scheduled write ever
retries**, so a tab killed by iOS OOM or a crash loses everything since the throw.

### 2. FAIL — Write failure is invisible, and the home page contradicts it
`progress.persistent` and `progress.pending` are read by **nothing** outside `src/lib/progress/`
(the only other hits across `src` are browse's unrelated `pendingFocus` and a local `pending` in
`src/lib/data/index.ts`). With `window.localStorage`'s getter throwing `SecurityError`, the home page
renders "Nothing practised yet — pick a level below. **Progress is kept on this device, no account
needed.**" and `/quiz/1` plays a full question, marks CORRECT and offers "Next word" with zero
console errors; a regex for `/not saved|storage|offline|private mode/i` over the whole body text
returns false. Evidence: `progress/shots/loop-1/progress-store-no-storage-home-mobile.png`,
`progress/shots/loop-1/progress-store-no-storage-mobile.png`. The store's own accounting is honest
(`pending` correctly stays true after a rejected write) — it is simply never surfaced.

### 3. MAJOR — Two tabs destroy each other's answers, and a Reset can be undone by the other tab
`flush()` writes `encode(this.#state)` over the key with no merge, and `sync()` returns early
whenever `#dirty` is set — so a tab mid-debounce ignores the other tab's `storage` event and then
overwrites it wholesale. Verifier: two real tabs, shared baseline `L5-0001`, B answers on `/quiz/2`,
A answers on `/quiz/1`; at gaps of 0 / 100 / 250 ms the final blob is
`{"v":1,"w":{"L5-0001":[…],"L1-xxxx":[…]},"l":{}}` — `/"L2-\d/` is false, B's answer gone. The loss
window is exactly the 400 ms debounce (at 900 ms, A adopts B's word correctly). The same flaw hits
the destructive path the learner explicitly asked for: A calls `resetAll()` (key removed, confirmed
`null`), B is mid-debounce so its `sync()` early-returns, B's debounce lands and rewrites the whole
blob **including the record A just erased**. Double-tap Reset, watch it clear, watch it come back.

### 4. MAJOR — An unreadable payload is destroyed by the first answer, with no backup
`decode()` returns `null` for corrupt JSON or `v > SCHEMA_VERSION`, `reload()` keeps the
constructor's `emptyState()`, the UI shows a clean "Nothing practised yet", and the next `flush()`
encodes that empty state over the key. Verifier reproduced both variants in-browser: seeded
`{"v":99,"w":{"L1-0001":[50,50,50,1788000000000,0]},"l":{"1":[30,…]}}` → one answer later the key is
`{"v":1,"w":{"L1-0053":[1,0,0,…]},"l":{}}`; seeded a truncated blob → same. `Object.keys(localStorage)`
afterwards is `['hskquiz:progress:v1']` only — **no sidecar backup is ever written**. One deploy
rollback or one truncated byte is irreversible loss of the learner's entire history.

### 5. MAJOR — `decode()`'s newer-schema guard is bypassable by exactly the payload it guards against
`count(raw.v ?? raw.version)` takes the first non-nullish value, so `{"v":0,"version":2,…}` reads as
version 0 and is **accepted** — a v2 payload misread as v1 and then overwritten on the first answer,
which is precisely the loss finding 4 describes. `{"v":1.9,…}` is likewise accepted because
`count()` floors before the comparison. Both verified against the real `decode()`; I re-derived both
from the source (`?? ` is nullish-only; `Math.floor(1.9) === 1`).

### 6. MAJOR — `forWord()`'s documented contract is false for any answered word
The JSDoc says "Mutating the returned object does nothing; call `recordAnswer`", but the body is
`this.#state.byWord[wordId] ?? blankWord(wordId)` — for a word with a record it hands back the live
`$state` proxy. Verifier: after `recordAnswer('L1-0001', true)` and a flush, setting
`store.forWord('L1-0001').seen = 999` changes the store *and* `levelSummary(1).answers`, is never
scheduled for a write (storage still holds `[1,1,1,…]` after 5 s of timers), and is then silently
persisted the moment any unrelated word is answered. The trap points straight at
`src/routes/browse/[level]/+page.svelte:508`, which hands the returned record to a child component.

### 7. MAJOR — Phantom word ids are counted and reported as fact, unbounded by the level's size
`decode()` accepts any id, `levelSummary` takes `total` from `SHIPPED_SIZES` but never clamps `seen`
or `mastered`, and `levelStats` (`src/lib/components/levels/stats.ts`) only prefix-filters. Seeded
900 records for `L1-9000…L1-9899` (HSK 1 ships 500): home renders "900 words practised · 900
mastered · 100% correct · 57y ago" and the HSK 1 card renders "500 words" directly above "900
practised · 900 mastered". Evidence: `progress/shots/loop-1/progress-store-phantom-ids-mobile.png`.
Two refinements from the verifier, both material: the *meter* is clamped
(`pct = Math.min(100, …)` in `LevelCard.svelte`) so only the text lies; and there is a real in-app
route to orphan ids, not just hand-editing — the 9 homograph merges left the id space sparse
(`L2-0340`, `L2-0378`, `L2-0482`, `L3-0007`, `L3-0103`, `L3-0599`, `L4-0556`, `L5-0559` are gaps),
and seeding `L2-0340` alone makes HSK 2 report "1 practised · 1 mastered". `summarize()` over an
explicit list is the one path that bounds itself.

### 8. MAJOR — Timestamps are sanitised for sign and integer-ness, never for plausibility
`count()` rejects non-finite, non-positive and fractional values and stops there. `lastSeen = 1`
renders "57y ago" on the home line and the HSK 1 card
(`progress/shots/loop-1/progress-store-phantom-ids-mobile.png`); `lastPlayed = now + 400 days`
renders "next yr." on the home headline; `now + 50 years` renders "in 50y". Clock skew or one junk
byte becomes confident nonsense.

### 9. MINOR — A `__proto__` key in the payload defeats `decode()`'s never-throws guarantee
`state.byWord[wordId] = record` on a plain `{}` fires `Object.prototype`'s `__proto__` setter, so
`byWord`'s prototype becomes the bogus record (I confirmed the JS semantics directly). `forWord('seen')`
then returns the number `7` typed as `WordProgress`, and `recordAnswer('seen', true)` throws an
uncaught `TypeError: Cannot create property 'seen' on number '7'` out of `applyAnswer`
(`progress-core.ts:52`). Blast radius is `forWord`/`recordAnswer` only — the home page survives
because `Object.values` skips the prototype, and `encode()` drops it on the next write.

### 10. MINOR — `forWord()` breaks its own return type on an empty store
`forWord('constructor')` returns a **function**, because the lookup runs against a plain object with
`Object.prototype` in its chain; same for `toString`, `valueOf`, `hasOwnProperty`. `recordAnswer` on
those ids writes onto the inherited object rather than creating a record — nothing is recorded and
nothing reports the failure. Findings 9 and 10 share one fix: a `null`-prototype map for `byWord`.

### 11. MINOR — Three counters disagree about which ids count
`{"v":1,"w":{"L9-0001":[3,3,3,…]},"l":{}}` makes `overallSummary` report practised 1 and started
true (it walks every record blindly), while `levelStats` (prefix filter) and `levelSummary`
(`levelOfId`, which rejects 6–9) both report 0 — the headline says "1 words practised" over five
cards that all read "Not practised yet".

### 12. MINOR — Every cold load flashes the empty state
`curl` of the dev server returns HTML containing "Nothing practised yet — pick a level below" plus
five "Not practised yet" cards, unconditionally; `hydrated` only flips inside an `$effect`, so the
first client frame is guaranteed to be the SSR empty state for every returning learner. There is no
route-level `ssr = false` and no pre-hydration inline script. Evidence:
`progress/shots/loop-1/progress-store-ssr-flash-mobile.png` (empty state + five empty bars for a
learner with 40 words and 9 sessions). The critic's 268 ms figure under 6× throttling was not
re-measured by the verifier; the flash itself is structural and certain.

### 13. MINOR — "1 words practised"
`src/routes/+page.svelte:57` is `{ value: String(summary.practised), label: 'words practised' }`
with no plural branch. `SessionSummary.svelte:189` gets this right, so the app is inconsistent with
itself.

### 14. MINOR — Genuinely dead API and duplicated level maths
`summarize`, `resetLevel`, `persistent` and `pending` have no consumer outside the module; there is
no per-level reset anywhere in the UI (only the global double-tap Reset, which does work); and level
progress is computed twice, in `ProgressStore.levelSummary` and in `levelStats`.

---

## Refuted — not counted against the piece

- **"Roughly half the public API is dead, including `sync` and `reload`."** Refuted. `reload()` is
  the entire load path (called by the constructor, `progress.svelte.ts:96`); `sync()` is called by
  the module's own `storage` listener (`:353`) and was watched working in a real browser at a 900 ms
  gap. The critic's grep excluded `src/lib/progress/`, hiding the call sites. "Only three call
  sites" is also wrong — `recordAnswer`, `resetAll` and `progress.state` are outside the module too
  (six sites). Only the trimmed version in finding 14 survives.
- **"Shipped word counts contradict `reference/hsk`."** Numbers are right (4,307 vs 4,316) but the
  framing invites a wrong inference: no official word is missing — all 4,316 rows ship, 9 same-level
  homographs as one card each carrying an `ids` array, and `vocab.spec.ts` asserts exactly that.
  A documented, tested trade-off, and out of scope here: the store only reads `SHIPPED_SIZES`.
- **"Permanently disables persistence for the rest of the page's life."** Overstated as written
  (a `pagehide` / reset flush un-latches it); the retry defect itself is confirmed — see finding 1.

## Blind judge
None run for progress-store. The A/B pairs under `progress/blind/loop-1/` cover app-shell,
design-system, level-select, quiz-card, session-summary and vocab-browse. This piece was judged on
source inspection plus the driven shots: `progress-store-mobile.png`, `progress-store-desktop.png`,
`progress-store-answered-mobile.png`, `progress-store-answered-desktop.png`,
`progress-store-quota-full-mobile.png`, `progress-store-no-storage-mobile.png`,
`progress-store-no-storage-home-mobile.png`, `progress-store-phantom-ids-mobile.png`,
`progress-store-ssr-flash-mobile.png`.

---

## Biggest gap

**Make `flush()` the one durable write path: read the key's current bytes, merge, then write — never
blindly overwrite, never latch, never fail silently.** Everything above that actually loses a
learner's answers (findings 1, 3, 4, and the Reset-undo) is the same defect wearing four hats: the
store treats `setItem(encode(memory))` as if it owned the key alone and as if it could not fail.

Concretely, in `src/lib/progress/progress.svelte.ts`:

1. **Merge before writing.** In `flush()`, `getItem` first and `decode()` it. Merge per word id and
   per level, last-write-wins on `lastSeen` / `lastPlayed` with `seen`/`correct` taking the larger
   value, then write the merged result and adopt it into `#state`. This removes the cross-tab
   clobber and, applied to `resetAll`/`resetLevel` as an explicit tombstone rather than a plain
   removal, stops a mid-debounce tab resurrecting the history the learner just erased.
2. **Never overwrite bytes you could not read.** If that pre-write `decode()` returns `null` and the
   raw text is non-empty, copy the raw bytes to `hskquiz:progress:broken` *before* writing, once.
   While you are there, close the guard that lets the bad payload through in the first place: use
   `raw.v` only when it is a number (`{"v":0,"version":2}` currently reads as v0 and is accepted),
   and compare the unfloored value so `1.9` is refused.
3. **Stop latching, start retrying.** Drop `!this.#persistent` from `#schedule()` — `persistent`
   becomes a *reported status*, not a gate. On a rejected write keep `#dirty = true` and re-arm the
   timer with backoff (e.g. 1 s → 5 s → 30 s, capped) so the next answer retries a storage that has
   since recovered.
4. **Say so.** Render `progress.persistent === false` as one line on `/` and on the session summary
   ("Your browser isn't saving progress on this device"), and swap the home copy "Progress is kept
   on this device, no account needed" for the truth when it is false. Right now the two accessors
   that would have caught every one of these failures are read by nothing.
5. **Rewrite the three tests that assert the old contract** (quota "stops retrying", cross-tab
   "keeps unsaved local answers", corrupt-JSON "repairs the key on the next write") so they assert
   retry, merge and backup instead. Until those change, the fix cannot land green.

Findings 6–14 are real and worth fixing, but they are local edits — a null-prototype `byWord`, a
detached copy from `forWord`, a plausibility clamp on timestamps, one shared validated notion of
"which ids count", a plural branch. This one is the contract.
