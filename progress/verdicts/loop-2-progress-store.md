# Verdict — progress-store, loop 2

**FAIL.** Nothing the critic reported was refuted; the verifier reproduced every finding in node
against the real `ProgressStore` and added four more, three of them MAJOR. The loop-1 gap (merge
before write, rescue unreadable bytes, retry instead of latching, report status) was implemented —
and the merge it introduced is now the thing that destroys data. The store can silently erase every
answer a learner gives while `flush()` returns `true` and the home page promises "Progress is kept
on this device."

Blind judge: n/a. progress-store has no A/B pair under `progress/blind/loop-2/` — it is a logic
piece and was judged from repro, not from a look-and-feel comparison.

## Surviving findings

### FAIL

**1. A tombstone stamped ahead of the clock silently discards every answer.**
`applyTombstones` (progress-core.ts:349) deletes any record with `record.lastSeen < cut`, and
`#cleared` is a raw in-memory `Date.now()` that never passes through `stamp()`. Tap Reset on a phone
whose clock is 30 min fast, correct the clock, answer three questions: the key is
`{"v":1,"w":{},"l":{},"c":{"0":1788034359116}}` — `flush()` true, `status` 'saving', `pending` false.
Verifier correction to the write-up: the blackout lasts **as long as the skew**, not a fixed 36 h
(words persisted at 1 min / 10 min / 2 h / 35 h skew = 0; at 36 h + 1 min = 1, because `stamp()`
then pulls the tombstone back on decode). Worse than reported: `#adopt` (progress.svelte.ts:461)
replaces in-memory state with the emptied merge, so the learner watches the count zero out live.
Shot: `progress/shots/loop-2/progress-store-future-tombstone-mobile.png`.

*Root cause, stated plainly (verifier):* `encode()` never applies tombstones, so the store routinely
writes bytes its own decoder reads as empty — `encode(one record, {0: now+1h})` round-trips to zero
words. Patching the comparison alone leaves the format self-inconsistent.

**2. The rescue net covers only bytes that cannot be *decoded*.**
`#rescue` is called from exactly one place — the `stored === null` branch of `#read`
(progress.svelte.ts:433). A payload that decodes perfectly and is then annihilated by a bad
tombstone is destroyed with no backup: 40 words + 12 sessions gone, `hskquiz:progress:broken` null.
Shot: `progress/shots/loop-2/progress-store-far-future-tombstone-mobile.png`. Reachability is
qualified — the verifier could not produce a *far*-future tombstone through the UI on one device —
but the same hole is entered through finding 1's ≤ skew window, which reproduces end to end.

### MAJOR

**3. `resetAll()` under a rejected write is the exact inverse of its promise (verifier-found).**
progress.svelte.ts:267-275 calls `storage.removeItem(BACKUP_KEY)` unconditionally without checking
`flush()`. With `setItem` throwing: in-memory state empty (learner sees an erased app), the key
still holding all 5 records, and the only backup the store ever makes deleted. A refresh brought all
5 words back. Reset neither erases the payload nor keeps the copy.

**4. The mirror of finding 1: a slow clock makes Reset unable to stick (verifier-found).**
`stamp()` (progress-core.ts:523) clamps far-future records back to `now`, so on a wrong-in-the-past
device every stored record decodes with `lastSeen === load instant`, which is `>=` any tombstone, and
the strict `<` never fires. Reproduced: reset on a 2001 clock, a stale tab wrote its pre-reset blob
back, `sync()` + `flush()` restored the erased words. A sub-2024 tombstone is floored to 0 and
dropped entirely. For a feature whose job is forgetting, this is the worse half.

**5. Another tab clearing site data is silently undone (verifier-found).**
The module listener (progress.svelte.ts:580-583) routes `event.key === null` — what `clear()` and
"clear site data" report — into `sync()`, which sees `stored === null`, merges to `mine`, and
rewrites. Five answers came back verbatim. Clearing site data with a second tab open clears nothing.

**6. The two screens where answers are given never say storage is failing.**
The only `<StorageNotice />` in `src/` is +page.svelte:165; `curl /quiz/1 | grep -c storage-notice`
→ 0. SessionSummary.svelte:143 renders "10 of 500 words met · 0 mastered" plus a mastery arc from
`progress.levelSummary()` with no reference to `status` — RAM-only figures on the one screen a
learner reads to decide the session counted. Shot:
`progress/shots/loop-2/progress-store-summary-quota-mobile.png`. Understated: quiz/[level]/+page.svelte:242
prints "Nothing you have practised is lost — progress is kept on this device." *unconditionally* in
the load-failure panel — a flat lie when status is 'unavailable' or 'failing'.

**7. `status` reads 'saving' before any write has been attempted.**
progress.svelte.ts:150; `detectStorage()` only ever calls `getItem` (line 555), so nothing
round-trips — instrumented `setItem` count at construction is 0. Cold load of `/` with a full quota
therefore prints the promise and the notice stays silent. Shots:
`progress/shots/loop-2/progress-store-quota-home-mobile.png` (cold, dishonest) vs
`progress-store-quota-home-spa-mobile.png` (client nav, honest). A probe write at construction
settles it.

**8. The salvage notice is one-shot and there is no restore path.**
`#salvaged` is set only inside `#rescue`, reachable only while the *current* key is unreadable; one
answer replaces the key and the notice never returns, while `hskquiz:progress:broken` sits in quota
with no reader anywhere in the codebase. Shot:
`progress/shots/loop-2/progress-store-salvage-visit2-mobile.png`.

### MINOR

9. Unformatted counts: +page.svelte:70 `String(summary.practised)` and :74 `String(summary.mastered)`
   under a `toLocaleString('en')` total — "4308 words practised · 1284 mastered" beneath "4,308 cards".
   Shot: `progress/shots/loop-2/progress-store-heavy-home-mobile.png`.
10. Every cold load flashes the empty state: SSR HTML contains "kept on this device" and "Start here"
    and no "words practised"; real strip at 522 ms under 6× throttle. Shot:
    `progress/shots/loop-2/progress-store-ssr-flash-mobile.png`. Same latch in browse/[level]:112.
11. Four public members have no consumer: `summarize()`, `resetLevel()`, `pending`, `persistent`.
    `resetLevel` is the untested carrier of the finding-1 defect. Its docstring also promises
    coverage for non-`L#-` ids that `levelOfId` cannot deliver.
12. Answers given on a pre-2024 clock persist as `lastSeen: 0` yet still count as practised — the
    level card shows the word and the session with no last-played date.
13. After a quota clears, a new answer cannot pull the write forward past `#retryArmed` — on the
    30 s rung that is a 30 s window in which a tab kill loses everything.
14. PERF: 11.10 ms per `recordAnswer` + `flush` on the real 198 KB payload (3.21 ms of it
    `decodeStored`), three full passes over ~200 KB per answer — plausibly 50-100 ms of blocked main
    thread on a mid-range phone, landing while the learner reads the feedback. Untested.

## Biggest gap

**Stop deciding what to erase by comparing two wall-clock timestamps. Make a reset a fact recorded
in the payload, not an inequality against `Date.now()`.**

Replace the `cleared: {scope: millis}` tombstone with a monotonic **reset generation** per scope, and
stamp every record with the generation it was written under:

- `StoredProgress.cleared` becomes `{0: n, 1: n, …}` integer counters. They are never compared to a
  clock and never pass through `stamp()`; merging two payloads takes `Math.max` per scope.
- Every `WordRecord` and level entry carries the scope generation current when it was last written.
- `resetAll()` / `resetLevel()` **increment** the counter instead of writing `now`.
- `applyTombstones` deletes a record iff `record.gen < cleared[scope]` — no timestamp involved. A
  record a stale tab wrote before the bump carries the old generation and dies; a record the learner
  is giving right now carries the new one and survives, on any clock, in either direction. This
  closes findings 1 and 4 with one mechanism instead of two clamps.
- Call `applyTombstones` inside `encode()` so the store can never write bytes its own decoder reads
  as empty — the encoder and decoder must agree on what a tombstone means (verifier's root cause).
- In `flush()`, diff the decoded disk payload against the merged result: if the merge drops records
  that no generation bump *in this write* justifies, copy the pre-write bytes to
  `hskquiz:progress:broken` and set `#salvaged` — this is finding 2's missing half. And in
  `resetAll()`, only `removeItem(BACKUP_KEY)` when the flush that erased the payload actually landed
  (finding 3).

Prove it in the running browser, not in unit tests. With the device clock 30 min fast, tap the real
Reset on `/`, correct the clock, answer three questions on `/quiz/1`, and assert
`localStorage['hskquiz:progress']` holds three word records after a reload. Then set the clock to
2001, tap Reset, let a stale tab write its pre-reset blob back, and assert the erased words stay
erased.
