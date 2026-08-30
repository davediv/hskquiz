# Verdict — progress-store, loop 4

**Result: FAIL.**

The loop-3 gap is genuinely closed. Both of its acceptance repros pass in a running browser: the
one-word backup no longer refuses a 300-word payload (`#keepAside` weighs both sides), and the
`1e308` generation counter no longer deletes every record forever (`count()` has a ceiling).
`#guardShrink` now fires on the write path, so structural corruption — a `w` that arrived as an
array — is caught instead of being silently overwritten. That work is real and stands.

What fails is what the fix built. The rescue net now catches far more, and everything it catches
is either destroyed by the button labelled "Restore it" or has no exit but "Discard". The
independent verifier **refuted none of the nine reported findings**, reproduced every one against
the real store, and found seven more — including a second data-destruction path and a
timestamp-corruption case strictly more common than the one the critic tested. No blind judge ran
this piece this loop.

## Surviving findings

### 1. FAIL — "Restore it" deletes the only copy and restores nothing
`restoreRescue()` (`src/lib/progress/progress.svelte.ts:441-478`) re-decodes the backup with
`decodeStored`, which re-applies **that payload's own `g` counter** — the very thing the copy was
kept aside because of. Backup = `{"v":1,"w":{300 L1 records at seen:6},"l":{…},"g":{"1":3}}` →
`weigh()` says 300 words, `decodeStored()` yields **0 records**. `restoreInto` folds in nothing,
`flush()` lands, `restoreRescue` returns `true` on the strength of the write landing alone, and
`discardRescue()` (`:479`) removes `BACKUP_KEY` unconditionally. After the tap: `broken` = null,
`main` = 104 bytes unchanged, the notice vanishes as if it had worked, no failure line, and a
reload reads "Start here · 0 of 500 practised".
Shots: `progress/shots/loop-4/progress-store-crit-restore-mobile.png`,
`progress-store-crit-restored-mobile.png`.

**There is no post-condition anywhere on this path.** Nothing compares the restored record count
against the `#rescued.words` the notice just printed. The verifier also removed the "that payload
never occurs" defence: put 40 records at gen 0 plus `g:{"0":1}` on the **main** key — a stale tab's
blind write, a half-applied reset, a rolled-back build — load, answer **one** card, and
`#guardShrink` (`:745`) writes that 40-word payload to `BACKUP_KEY` itself with reason `'lost'`.
The net manufactures precisely the backup its own restore path cannot read. Control: the same 40
records *without* `g` restore all 40, so the generation counter is the entire difference.

### 2. FAIL — junk that merely mentions word ids evicts a real backup, with no user action
`ID_KEY_RE` (`progress-core.ts:775`) is deliberately unanchored, so for bytes that do not decode
`Heft.words` is a raw count of quoted id-shaped strings *anywhere* in the payload. `heavier()`
(`:839`) ranks words first, and `#keepAside` (`progress.svelte.ts:812-830`) then overwrites
`BACKUP_KEY` whenever incoming wins. Verifier repro through the store on a plain load: backup held
a real readable 50-word / 400-answer copy; main key held `{"v":99,"note":[400 id strings]}` →
`weigh` = `{words:400, answers:0, readable:false}`, `heavier(junk, real)` = true, and after
construction the backup key contains `"v":99` and no longer contains `"L1-0001":[8,7,3`. The
learner is shown "about 400 words" over a payload holding none, and the 50 real ones are gone.
This defeats the exact invariant `#keepAside`'s own docstring rests on: *"a copy can only be
replaced by more history than it holds."*

### 3. MAJOR — Discard is the only exit for anything the version gate refuses
Seeded a payload byte-for-byte identical to what the app writes, only `"v":7` — the "rolled back
from a future build" case the code names. `decodeStored` returns null (`progress-core.ts:497`),
`weigh` = `{words:120, readable:false}`, `restoreRescue()` returns false, and
`StorageNotice.svelte:176` gates Restore on `rescue.readable && rescue.words > 0`, so the DOM
offers exactly `["Discard"]`. Same for an array-shaped `w` of 200 verbose
`{id,seen,correct,streak,lastSeen,lastMissed}` records — the most machine-readable corruption
there is. Behind the notice every level card reads "Start here · 0 of 500 practised". There is no
copy-out, no export, no view — only the button that throws it away.
Shots: `progress-store-crit-newerschema-mobile.png`, `progress-store-crit-arrayshape-mobile.png`.

### 4. MAJOR — a learner's first session at a level still reads as zero (loop-3 #8, untouched)
Seeded exactly what a finished first session writes — ten introduction records `[0,0,0,ts,0]` plus
`l:{1:[1,ts]}`: home shows "0 words practised" beside a Reset button and "HSK 1 · Continue · 0 of
500 practised · 45m ago" over an empty bar; `/browse/1` reads "500 All / 500 New" with all ten
"Not practised yet". Reproduced by playing a real session too.
`src/lib/components/levels/stats.ts:53` and `:105` still test `record.seen > 0`;
`src/lib/components/browse/status.ts:49,124` give the browse half. The store's own
`levelSummary(1)` already returns `met: 10` and **nothing renders `met`**;
`src/lib/session/record.ts:157-182` documents the symptom verbatim and names the change for each
of four call sites; `hasMet`/`isTaughtOnly` are imported only by `src/lib/session/index.ts`. The
fix is written out in prose in the repo and was not made.
Shots: `progress-store-crit-firstsession-mobile.png`,
`progress-store-crit-firstsession-browse-mobile.png`.

### 5. MAJOR — a clock merely 36h slow permanently flattens real history (verifier-found)
`stamp()` (`progress-core.ts:1093-1101`) special-cases only `now < EPOCH_FLOOR`. A device three
days slow is a perfectly normal post-2024 clock and gets the full future-clamp: five records with
five distinct real 2026 stamps an hour apart, loaded at `now = T0 - 3 days`, all came back — and
were **written back** — as `1786740800000`, every `lastSeen` and every `lastMissed`. A word missed
five days ago now reads as missed just now, which is exactly the input the miss-weighted scheduler
runs on. `FUTURE_SLACK_MS` is 36h, so any device slower than that silently rewrites its recent
history on one load. The critic tested the 2001 clock — the rare case the code *does* handle, and
the case `stamp()`'s docstring claims to have fixed. The dead-battery laptop is the common case
and is unhandled. (The critic's own half stands: a 2001 clock still writes four distinct events at
one identical `EPOCH_FLOOR` stamp, and `+page.svelte:31` still reads raw `Date.now()` while the
store floors what it writes.) Shots: `progress-store-crit-slowclock-mobile.png`,
`progress-store-crit-slowclock-home-mobile.png`.

### 6. MINOR — the home headline counts records no level card can; fixed on the dead path
Seeded `"hello"` and `"zz-1"` beside two real ids: home reads "4 words practised · 4 mastered ·
100% correct" while the five level cards sum to 2. `ProgressStore.overallSummary`
(`progress.svelte.ts:539`) *does* skip `levelOfId(wordId) === null` — and grep over `src/` shows
its only non-spec reference is its own definition. `+page.svelte:23,40` imports
`stats.ts::overallSummary`, whose `records()` (`stats.ts:40`) is a bare `Object.values(byWord)`.
The docstring at `:530-535` even names `"hello"`/`"zz-1"` as the case it fixed.
Shot: `progress-store-crit-ghostids-mobile.png`.

### 7. MINOR — the id guard checks the range but not the shape
Two mechanisms. (a) `isShippableWordId` (`progress-core.ts:384`) bounds by `LEVEL_SIZES`, so the
eight homograph holes the footer itself discloses — `L2-0340`, `L3-0007` and six more — render as
"1 of 770 · 1 mastered · 100%" for words the app can never ask; its own docstring concedes "the
holes themselves are not checked here". Verified against the shipped data: neither id is in
`src/lib/data/hsk2.json` or `hsk3.json`. (b) Verifier-found: the regex is `/^L([1-9])-(\d{1,7})$/`
with a numeric bound, so `L1-1`, `L1-01`, `L1-001`, `L1-0001`, `L1-00001`, `L1-000001` and
`L1-0000001` are **seven distinct accepted keys for one word** — all seven survive decode and give
`levelStats(1) = {practised:7, mastered:7, answered:28}`. Requiring the canonical 4-digit form is
cheap. (The junk-id half of loop-3 #5 is genuinely fixed: `L1-9999`, `L9-0001`, `'L1-0001 '` and
`L1-9000x` were all refused.)

### 8. MINOR — the rescue notice's two numbers contradict each other in one sentence
"It holds 300 words · 0 answers" over 300 records that each carry `seen: 6`. `Heft.words` comes
from `weigh()`'s byte scan, `Heft.answers` from `tally()` on the post-generation decode, and
`describeRescue` (`progress.svelte.ts:985`) prints them side by side as one payload. Per finding 1,
the wrong half is the one the button honours.

### 9. MINOR — a reset the browser refused still empties the screen
With `setItem` throwing, two taps on `button.hskq-reset`: the stats strip disappears, HSK 1 falls
back to "Start here", and the key is byte-identical. The copy fix is real and good — "Progress was
not reset. The browser refused to write, so nothing was erased" — and a reload brings everything
back. But `resetAll()` (`progress.svelte.ts:415-417`) still assigns `emptyState()` before `flush()`
and never rolls back on a rejected write, so the numbers on screen assert an erasure that did not
happen. `restoreRescue` rolls back correctly; `resetAll` does not.
Shots: `progress-store-crit-quotareset-mobile.png`, `progress-store-crit-quotareset-reload-mobile.png`.

### 10. MINOR — four bytes of junk raise a permanent, action-less rescue notice
Main key set to the literal string `null` (also `[]`, `"x"`, `123`, `{"v":1,"w":null}`): rescue =
`{words:0, answers:0, readable:false, reason:'unreadable'}`, `#keepAside` copies those four bytes
into `BACKUP_KEY`, and StorageNotice renders "Earlier progress was kept aside… it is being kept
rather than guessed at" with Discard as the only control — a frightening panel over literally
nothing, redisplayed every load until a write replaces the key.

### 11. MINOR — the storage promise is unconditional in the SSR bytes
`curl / | grep 'Progress is'` → "Progress is kept on this device — no account needed."
`+page.svelte:235` gates on `{#if !hydrated || …}` and `hydrated` is set only in a client
`$effect`. Loop-3 #9, unchanged — though it is a documented anti-flash trade-off and
post-hydration behaviour is correct (SecurityError renders the honest line, the quiz still runs,
zero console and zero page errors across every run).
Shots: `progress-store-crit-nostorage-home-mobile.png`, `progress-store-crit-nostorage-quiz-mobile.png`.

### 12. The tests only cover the case that works
`progress.spec.ts` has exactly three `restoreRescue` assertions (`:799` true, `:822` true, `:835`
false for `'not json'`). **None puts a `g` counter in the backup.** One test asserting that
`restoreRescue` returns false, or keeps the backup, when the decode yields fewer records than
`weigh()` promised would have caught findings 1 and 8 together.

### Not findings — verified hardened
Prototype-shaped ids (`__proto__`, `constructor`, `toString`, `prototype`) all refused by
`RESERVED_IDS`, nothing leaked off `Object.prototype`; `correct <= seen` and `streak <= correct`
hold at every entry point, so no path produced accuracy above 100%; the generation ceiling behaves
as documented (a junk `1e22` counter deletes nothing); `#forgetting` is set by `#bump`, so both
`resetAll` and `resetLevel` bypass `#guardShrink` and a normal reset never raises a false notice.

## Biggest gap

**Make `restoreRescue()` prove it restored something before it deletes the only copy — and measure
the backup exactly once, the same way, for both the notice and the restore.**

In `src/lib/progress/progress.svelte.ts:441-480`:

1. **Decode the backup with generations disabled.** The copy was set aside *precisely because* its
   `g` was not trusted; re-applying it through `decodeStored` is what makes the restore return
   zero. Add a decode path that ignores `stored.gens` (or restore at the live generation, as the
   docstring already promises: "every restored record is stamped at the current generation").
2. **Count what `restoreInto` actually folded in, and gate the delete on it.** Never call
   `discardRescue()` unless that count is `> 0` **and** at least the number the notice printed.
   Otherwise leave `BACKUP_KEY` in place, keep the notice up, and say what came back and what did
   not. `restoreRescue` currently returns `true` on the strength of `flush()` landing; that is the
   general defect, and one comparison fixes it.
3. **Build the notice's two figures from that same decode.** One source, so "300 words · 0 answers"
   can never appear over records that each carry `seen: 6`, and so the number the button honours is
   the number the learner read.
4. **Offer Restore whenever the current decoder can read the records, regardless of `v`.** A
   rollback from a future build (`{"v":7,…}`) and an array-shaped `w` of `{id,seen,correct,…}`
   objects are both fully parseable; decode what you can read and fall back to "cannot be read"
   only when the payload names ids you genuinely cannot parse. Both `StorageNotice.svelte:176` and
   `restoreRescue`'s own `!readable` early return follow from this one change.

The repro that must pass in a real browser, not a unit test: seed `hskquiz:progress:v1` with 300 L1
records at `seen:6` plus `"g":{"1":3}`, load `/`, answer two cards, tap **Restore it** → HSK 1
reads "300 of 500 practised", and `hskquiz:progress:broken` is gone *only because those words are
now in* `hskquiz:progress:v1`. Second repro: the same 300 records under `"v":7` → the notice offers
"Restore it", and tapping it brings all 300 back. Third, no hand-seeded backup at all: put 40
records at gen 0 plus `g:{"0":1}` on the main key, answer one card so `#guardShrink` writes the
backup itself, tap Restore → the 40 words are on screen.
