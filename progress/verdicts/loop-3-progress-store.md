# Verdict — progress-store, loop 3

**Result: FAIL.** The loop-2 gap (reset generations across tabs and clock skew) is genuinely closed —
verified in the running browser, not in tests: a reset on a 30-min-fast clock followed by a corrected
clock and a full session kept all 10 records at gen 1, two live tabs propagated a reset without eating
the other tab's post-reset answers, and a 4,316-record / 198 KB payload produced zero long tasks.
That work stands.

What fails is the safety net that was supposed to make all of it survivable. The independent verifier
refuted **none** of the eight reported findings and reproduced every one against the real store; it also
found four more of equal or greater severity. No blind judge ran this loop.

## Surviving findings

### 1. FAIL — the rescue net keeps the SMALLEST history and destroys the largest, then says the opposite
`#keepAside` (`src/lib/progress/progress.svelte.ts:643`) writes the backup only `if (existing === null)`
and latches `#salvageAttempted` for the whole session. Seed `hskquiz:progress:broken` with a 1-word copy
and `hskquiz:progress:v1` with a truncated 300-word payload, load `/`, answer three questions: the key
becomes the three new words, the backup still holds `L1-0001`, and the probe
`main.includes('L1-0250') || bk.includes('L1-0250')` is `false` — 300 words gone with no copy anywhere.
The notice on screen reads "It was copied somewhere safe rather than overwritten. It holds 1 word · 1
answers." Both halves are wrong: nothing was copied, and the count describes the wrong payload.
Shot: `progress/shots/loop-3/progress-store-rescue-collision-mobile.png`.
The in-code comment "First casualty wins: the oldest surviving copy is the one with the most history"
inverts the truth — history accumulates.

### 2. MAJOR — a corrupt generation counter is a permanent, silent write blackhole
`count()` (`progress-core.ts:855`) accepts any number-shaped value with no ceiling and `bumpGeneration`
is `Math.max(...) + 1`, so a bogus counter can never be lowered by any code path. Two reproduced levels:
`{"g":{"0":"9999999999999999999999"}}` deletes every record on load with no backup, no notice, no console
error; `{"g":{"0":1e308,"3":1e308}}` makes `generationFor` return `Infinity`, `stampGen` writes `Infinity`,
and `encode()` reads it back through `count(Infinity) → 0` and drops **every record on the way out** —
`flush()` returns `true`, `status === 'saving'`, `persistent === true`, and the key stays `{"w":{},"l":{}}`
forever while the home screen promises "Progress is kept on this device". `unexplainedLosses`
(`progress-core.ts:558`) can never catch either, because it treats any generation-explained deletion as
legitimate by definition. Corrupting a byte of `w` is survivable; corrupting `g` is not.

### 3. MAJOR — the rescue only catches JSON-level corruption, never structural corruption
`#decodeDisk` calls `#keepAside` only when `decodeStored` returns `null`, but `decodeStored` returns a
non-null *empty* payload for any parseable object whose `w` is the wrong type. Seeded
`{"v":1,"w":[<200 entries>],"l":{}}`: 0 words decoded, `rescue === null`, `BACKUP_KEY` undefined, and one
answer + flush overwrote all 200 records. Same for `w` as a string or a number. A truncated write usually
breaks JSON and is caught; a type-shaped corruption is not. `unexplainedLosses` also inspects only
`byWord` and ignores `state.levels` entirely, so a merge that annihilates every session count and
`lastPlayed` is never rescued and never reported.

### 4. MAJOR — a pre-2024 clock writes future timestamps *and* permanently flattens existing ones
`#at()` (`progress.svelte.ts:754`) returns `Math.max(EPOCH_FLOOR, now)` while `+page.svelte:37` renders
against raw `Date.now()`, so every screen prints "in 23y" — home strip "0 words practised · in 23y",
HSK 1 card "0 of 500 practised — in 23y". Shots: `progress-store-slowclock-home-mobile.png`,
`progress-store-slowclock-mobile.png`. Worse than loop-2's mirror finding: `stamp()` also pulls anything
beyond `now + 36h` back to `now`, so five records with five distinct real 2026 dates opened once on a 2001
clock all come back as `1704067200000` and every `lastMissed` is fabricated non-zero. Correcting the clock
does not undo it, and every record then carries an identical stamp, so `mergeWord`'s `newest` tie-break
and any recency weighting see a flat history.

### 5. MINOR — the id guard does not hold at all, and uses the wrong constant besides
`isShippableWordId` (`progress-core.ts:301`) returns `true` when the regex does **not** match, so
`'L1-9000x'`, `'L1-0001 '` and `'L1-+1'` all pass while `levelOfId`'s looser `/^L([1-9])-/` files them under
a level: 40 seeded `L1-9999Nx` ids read as 40 practised / 40 mastered on every HSK 1 surface. Separately it
bounds by `LEVEL_SIZES` while the box ships `SHIPPED_SIZES` with a sparse index, so the 8 real gap ids
(L2-0340, L2-0482, L3-0007, L3-0103, L3-0599, L3-0752, L4-0556, L5-0559) count as practised and mastered
for cards that can never be asked. Shot: `progress-store-ghostids-mobile.png`. And `recordAnswer` accepts
ids the decoder later refuses, so memory and disk diverge with no signal.
(The docstring's "highest id at each level is exactly that number" is actually true; what it gets wrong is
implying the range is dense.)

### 6. MINOR — reset under a rejected write shows an erased app that is not erased
`resetAll()` (`progress.svelte.ts:348`) empties `#state` before `flush()` and returns `void`. With
`setItem` throwing, the strip disappears, the key still holds all three records byte-identical, and the
only message is "Progress is not being saved… these answers live only in this tab" — the wrong sentence
for a reset. A reload brings everything back.
Shots: `progress-store-quota-reset-mobile.png`, `progress-store-quota-reset-reload-mobile.png`.
(The loop-2 half is fixed: `discardRescue()` is gated on `landed`.)

### 7. MINOR — `StorageNotice` branches on two of three `RescueReason` values
`StorageNotice.svelte:126` tests only `reason === 'lost'`, so a readable `'found'` copy is described as
unreadable in the same paragraph that counts its words. A payload the decoder refuses (`{"v":7,…}`) goes
into the backup with `words === null`, the Restore button at :146 never renders, and `restoreRescue()`
would fail anyway — provably no path back, only Discard.
Shots: `progress-store-rescue-collision-mobile.png`, `progress-store-newerschema-mobile.png`.

### 8. MINOR — a learner's entire first session at a level reads as zero
Every card of a first session is an introduction (`direction.ts:101`), which writes `seen: 0`, and both
counters that feed the home screen gate on `seen > 0` (`progress.svelte.ts:812`, `stats.ts:53`, `:104`)
while `started` is true via sessions. A complete HSK 1 session renders as "0 words practised · just now"
with a Reset button. The summary screen one route away manages "9 of 500 words met".
Shots: `progress-store-summary-mobile.png`, `progress-store-fastclock-mobile.png`.

### 9. MINOR — the storage promise is in the SSR bytes
`curl /` with no JS returns "Progress is kept on this device — no account needed." `+page.svelte:225`
guards with `{#if !hydrated || …}` and `hydrated` is set in an `$effect`, and `StorageNotice` renders
nothing before `onMount`, so a private-browsing phone's first paint always claims it uncontested. The
post-hydration behaviour is correct.
Shots: `progress-store-nostorage-desktop.png`, `progress-store-quota-desktop.png`.

### 10. MINOR — `overallSummary` has no level filter
`stats.ts:103` counts any key, so a payload with `"hello"` and `"zz-1"` gives a home headline of
"2 practised · 1 mastered" over five level cards that all read 0. And `restoreRescue()` assigns
`#state`/`#gens` before `flush()` and returns `false` without rolling back, so a rejected restore prints
"That could not be put back" beside numbers that already include the restored data.

## Biggest gap

**Move the rescue from "the decoder failed" to "this write shrinks the learner's history", and make
`hskquiz:progress:broken` hold the biggest copy it has ever seen.** One rule, at one chokepoint: *no write
may reduce the stored history without first copying the larger side aside and saying so on screen.*

Concretely, in `src/lib/progress/progress.svelte.ts`:

1. Delete the `#salvageAttempted` latch (`#keepAside`, ~:643). The size comparison below is what prevents
   the rescue loop the latch was guarding against.
2. Rewrite `#keepAside` to decode *both* the bytes about to be lost and whatever already sits under
   `BACKUP_KEY`, run the existing `tally()` on each, and store whichever holds more words (tie → more
   answers → the newer bytes). An undecodable incoming payload wins only against an empty slot. Set
   `#rescued` from the copy that actually ended up stored, with the reason describing **that** copy.
3. Call it from the flush path, not only from `#decodeDisk`'s `stored === null` branch: before `encode()`
   overwrites, compare the tally of the payload about to be written against the tally of the bytes on
   disk, and rescue the disk bytes whenever the write is smaller. That is the same call that covers the
   `w`-is-an-array case (decodes to 0 words, currently invisible) and the generation-driven mass deletion.
4. Give `count()` in `progress-core.ts` a ceiling (reject non-finite and anything past a sane generation
   max) so an `Infinity`/`1e22` counter can neither delete every record on load nor make `encode()` drop
   every record forever with `flush()` returning `true`.
5. Branch `StorageNotice.svelte:126` on all three `RescueReason` values so a `'found'` copy stops being
   called unreadable in the sentence that counts its words.

Two repros that must pass in a real browser, not a unit test:

- Seed `hskquiz:progress:broken` with a 1-word copy and `hskquiz:progress:v1` with a truncated 300-word
  payload, load `/`, answer one question → `hskquiz:progress:broken` contains `L1-0250`.
- Seed `{"v":1,"w":{"L3-0001":[5,5,5,<now>,0]},"g":{"0":1e308,"3":1e308}}`, load `/`, answer five
  questions, reload → those five answers are still there.
