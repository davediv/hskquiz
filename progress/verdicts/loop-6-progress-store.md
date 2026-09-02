# progress-store — loop 6 verdict

**PASS: no.** Loop 5's gap was closed in form — `#keepAside` now returns a boolean, the three
guards obey it, `resetAll` copies before it erases, Discard costs a second tap, the tap targets
measure 44 px — and the read-back check the builder added genuinely prevents a whole class of
loss. But the method the entire invariant now hangs on tests the wrong proposition: it proves *a*
copy exists, not a copy of *these* bytes. So real history is still destroyed uncopied, and the
screen above the hole reads "Nothing has been thrown away." A store that lies about what it kept
is further from the standard than one that merely lost data quietly.

No blind design judge ran for this piece (no `progress/blind/loop-6/progress-store/`) — it is not
a visual surface.

## Surviving findings

Two of the critic's nine were weighed out or downgraded; the verifier's two structural additions
are folded in.

### 1. FAIL — the copy proves a copy exists, not a copy of *this* history

`#keepAside` (progress.svelte.ts:1182) short-circuits:

```ts
if (kept !== null && holdsHistory(kept) && !richer(incoming, kept)) { …; return true; }
```

`richer()` (:1388) compares word/answer/level counts. It never compares identity. So any larger
copy already sitting in `BACKUP_KEY` — from a different level, a different session, a different
incident — is accepted as evidence that the bytes about to be overwritten are safe, and
`#guardShrink`, `#guardLoss` and `#keepErased` all wave the destruction through.

Confirmed twice, independently. Critic, in Chromium at 375×812: `BACKUP_KEY` = 300 HSK-2 records
(10,241 b), `STORAGE_KEY` = 40 HSK-1 records (1,413 b); three answers on `/quiz/1` took the main
key 1,413 → 140 b while the backup stayed byte-identical HSK-2 (`/L2-/` still true, `/L1-/` never
appears) — not one erased record copied. Verifier, driving the real store directly: same shape,
`flush()` returned **true**, status stayed `saving`, `progress.rescue` = `{words:300,
answers:1800, reason:'found'}`. Control in both runs: with `BACKUP_KEY` empty the identical shrink
*does* copy, which isolates :1182 as the mechanism.

The reset path has it too: with an unrelated 300-word backup present, `resetAll()` erased five
freshly answered HSK-2 records and left the backup untouched. And the screen then renders
`StorageNotice.svelte:233` verbatim — "A copy from an earlier visit is still sitting here,
waiting. **Nothing has been thrown away.** It holds 300 words · 1,800 answers" — directly above a
strip reading "3 of 500 practised" where 40 words had been.

Shots: `progress/shots/loop-6/ps6-lost40-uncopied-mobile.png`,
`ps6-shrink-withRichBackup-mobile.png` against the control `ps6-shrink-withNoBackup-mobile.png`.

**Same defect, second method** (verifier, missed by the critic): `#keepErased()` (:562-583) picks
the *richer* of {key bytes, live payload} and copies only that — but the reset destroys both.
Verified: an unreadable key naming 50 L1 records plus two freshly answered L2 words in memory →
`resetAll()` returned `true`, `BACKUP_KEY` holds the 49 junk-derived records, and the two live
answers are gone with no copy anywhere. This one fires on a *first* reset with no pre-existing
backup at all.

### 2. MAJOR — Reset never works at all when storage is unavailable

Structural, verified in the source and by execution. `flush()` returns `false` whenever `#storage`
is null (:800-806); `#keepErased()` returns `true` early for the same reason; so `resetAll()`
falls straight into `#eraseRefused(was, 'write')` (:545), rolls the in-memory erase back, and sets
`eraseBlockedBy = 'write'`. Verifier: `new ProgressStore({ storage: null })`, two answers
recorded, `resetAll()` → `false`, both records still in state; a second tap is identical. The
screen then prints "The browser refused to write, so nothing was erased and nothing was
changed — every answer below is still exactly where it was. Try again in a moment." No write was
attempted, there is nothing in storage to erase, and trying again can never help. `detectStorage()`
(:1425) returns null for Safari private mode and storage-disabled profiles, and `#readText()`
stands the store down to null mid-session on any read throw — so this also latches permanently
after one failed read in an otherwise normal session. Shots: `ps6-nostorage-mobile.png`,
`ps6-nostorage-quiz-mobile.png`.

### 3. MAJOR — Reset is deadlocked by a full quota, and the app offers no way out

The one action that frees storage is now conditional on having spare storage. Verified by both:
key seeded with 300 L1 + 200 L2 records (17–23 KB depending on run), a storage that refuses large
writes → `resetAll()` false, `eraseBlockedBy = 'copy'`, main key untouched, `BACKUP_KEY` absent,
second tap identical. `StorageNotice.svelte:143-150` prints "…the browser had no room to store one
— so nothing was erased and nothing was changed. Free some space and try again." Nothing in
`src/routes` or `src/lib` renders a control that frees space in that state: Discard lives inside
the `{#if rescue}` block (`StorageNotice.svelte:216`) and there is no rescue. Terminal until the
learner clears site data from browser settings. Shot: `ps6-reset-fullquota-mobile.png`.

### 4. MAJOR — Reset relocates rather than erases, and its confirm still hides the stakes

Verified in the running app: seed, two taps, `STORAGE_KEY` → `{"v":1,"w":{},"l":{},"g":{"0":1}}`,
`BACKUP_KEY` → every record verbatim (3,441 b at 100 records; 17,063 b at 500), surviving a hard
reload and a subsequent session with no expiry. The armed label measures exactly "Tap again to
erase" — loop 5 asked for the stakes and the sibling control got them (`Tap again to delete
${discardStakes}`, `StorageNotice.svelte:268`), while Reset, the one that matters on a borrowed
device, still says nothing and is now the less accurate of the two. Shots:
`ps6-reset-armed-mobile.png`, `ps6-reset-after-mobile.png`, `ps6-double-reset-mobile.png`,
`ps6-reset-reloaded-mobile.png`.

Two of the critic's supporting claims here are wrong and are struck: it is **not** silent (the
post-reset screen leads with "Reset erased what was here, and this is the copy it kept first…"),
and the doc comment it quotes describes the main key, with the very next paragraph headed "It
keeps a copy". The defect is the missing stakes and the privacy expectation, not concealment.

### 5. MAJOR — a returning learner's first paint asserts zero progress

`curl -s http://127.0.0.1:5177/` returns exactly one "Start here", one "0 of 500 practised", one
"0 of 1,070 practised" and zero "words practised" — build-independent, off the server bytes. Cause
is in source, not accident: `src/routes/+page.svelte:30-40` holds `hydrated = false` until an
`$effect` runs, and `snapshot = hydrated ? progress.state : null`. Critic measured 475 ms of "0 of
500 practised" at 6× CPU throttle (160 ms → 635 ms) for a learner with 3,000 answers; the
verifier did not re-run the timing but confirms the structure. Shots: `ps6-flash-zero-mobile.png`
vs `ps6-flash-settled-mobile.png`.

### 6. MINOR — the rescue panel opens a running drill

`src/routes/quiz/[level]/+page.svelte:292` renders `<StorageNotice />` as the first child of
`main.quiz`, so a two-button database-recovery dialog sits above the character being learned.
Measured 135–155 px of the question's vertical room at 375 px wide (both runs agree on the
substance; absolute numbers differ with viewport height). Tap targets are genuinely fixed —
84×44 and 71×44, up from loop 5's 28 px. It belongs on home, between sessions. Shots:
`ps6-quiz-rescue-mobile.png` vs `ps6-quiz-clean-mobile.png`.

### 7. MINOR — a write refused for a *copy* reason is reported as a quota refusal

With `BACKUP_KEY` writes accepted-and-dropped, the precondition worked exactly as designed —
1,413-byte main key untouched, nothing destroyed — but `flush()` returned false and the only
notice available is `StorageNotice.svelte:176`: "The browser refused the last write, most likely
because its storage is full." Nothing was refused and storage is not full. `resetAll` already
distinguishes these through `eraseBlockedBy: 'write' | 'copy'`; `#failWrite()` (:1294) carries no
reason. Reachable without a shim: the read-back check at :1193 fails whenever a second tab
rewrites `BACKUP_KEY` between this tab's `setItem` and `getItem`. Shot: `ps6-dropwrite-mobile.png`.

### 8. MINOR — `resetLevel()` is still dead destructive surface

`grep -rn resetLevel src --include='*.svelte' --include='*.ts' | grep -v spec` → four lines: the
definition at progress.svelte.ts:485 and doc mentions at :38, :949 and progress-core.ts:408. No
route, no component. It has now grown a `#keepErased` precondition and two `#eraseRefused`
branches that nothing can reach. Unchanged from loop 5.

### 9. MINOR — `isShippableWordId` bounds by `LEVEL_SIZES`, not `SHIPPED_SIZES`

`L2-0771` is accepted and stored while `L2-0900` is dropped, so a hand-written key can make a
level card read "1 of 770" for a word the box does not contain, while `/browse/2` shows all 770
"Not practised yet". Unreachable from the app's own session builder, which mints shipped ids only.
Worth a bound fix, not a fail.

## Weighed out

- **"Home and the level cards disagree" — REFUTED on its own evidence.** The critic's exact three
  ids (L2-0340, L2-0482, L3-0007) seeded live give strip "3 words practised · 3 mastered · 100%"
  *and* HSK 2 "2 of 770 · 2 mastered", HSK 3 "1 of 969 · 1 mastered". No card reads "0 of N". The
  stated mechanism is wrong too: both figures come from `src/lib/components/levels/stats.ts`, and
  `isShippableWordId` is in neither path. HSK 4/5 "0 of 999 / 0 of 1,070" is the documented
  `SHIPPED_SIZES` choice in `src/lib/data/sizes.ts`, disclosed in the footer. What survives is the
  narrower bound bug filed as #9.
- **"'words practised' counts words only shown" — confirmed as fact, downgraded to not-a-defect.**
  Four `noteSeen` calls do produce `[0,0,0,ts,0]` and "4 words practised". But the store separates
  `met` from `seen` honestly and comments why, and `stats.ts:8-14` records the measured failure of
  the alternative (ten cards just taught reading "0 of 500 practised" beside a Continue badge).
  A word-choice argument about one label, not a store defect.

## Verified sound (do not re-litigate)

Under adversarial probing: restore-after-reset returns all records plus the level entry, re-stamped
at the live generation; a restore refused by quota rolls state back exactly and keeps the copy
(`{promised:1, landed:0}`, key byte-identical); `restoredTotals`/`holdsAtLeast` do not
false-negative when live state outranks the copy; two tabs answering interleaved lose nothing; a
reset in one tab survives a stale second tab's later flush; a cleared quota flushes every pending
record; `noteSeen` does not touch an already-answered word; biggest-copy-wins eviction holds.

## Biggest gap

**Make every copy prove *these* bytes, and stop letting an unrelated backup authorise a
destruction.** In `src/lib/progress/progress.svelte.ts`:

1. Delete the `!richer(incoming, kept)` early `return true` in `#keepAside` (~:1182). A richer,
   unrelated copy in `BACKUP_KEY` is not evidence that the history about to be overwritten is
   safe — `richer()` compares counts and never identity. When a *different* copy is in the way,
   fold the outgoing payload into it (merge both sides into one rescue payload — `restoreInto`
   already does exactly this merge) and return `true` only once a readable copy that **contains
   this history** is in the key, verified by the read-back you already added. Return `false`
   otherwise, so `#guardShrink`, `#guardLoss` and `#keepErased` refuse the destruction the way
   they already do when the key is empty. Keep the byte-identical case as it is (same rescue,
   fresh reason).
2. Apply the same rule inside `#keepErased()` (~:562-583): a reset destroys **both** the key bytes
   and the live payload, so copy the union of the two, not `richer()`'s pick of one.

Three repros must pass in a real browser before this is closed:

- **(a)** `BACKUP_KEY` = 300 HSK-2 records (10,241 b), `STORAGE_KEY` = 40 HSK-1 records (1,413 b)
  under `g:{"1":3}`; answer three cards on `/quiz/1` → either those 40 records are still in the
  main key, or a copy containing them is in `BACKUP_KEY`. No screen says "Nothing has been thrown
  away" while HSK-1 history is missing from both keys.
- **(b)** Reset with 300 L1 records, practise five HSK-2 words, Reset again → the copy left behind
  contains those five.
- **(c)** Unreadable/junk main key naming 50 L1 records plus two freshly answered L2 words in
  memory → after `resetAll()`, the copy contains the two L2 answers.
