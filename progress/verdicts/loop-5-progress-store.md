# Verdict — progress-store, loop 5

**Result: FAIL.**

The loop-4 gap is genuinely closed, and closed well. All three acceptance repros pass in a real
browser: `readRestorable` reads the copy as a copy (generations ignored, version unenforced, both
`w` shapes accepted), it is the *same* read the notice's sentence comes from, and `restoreRescue`
now counts what landed in live state before it deletes anything. The independent verifier
reproduced all three end to end — 300 records under `g:{"1":3}` restore to "301 of 500 practised"
and survive a reload; the same records under `"v":7` restore; a `#guardShrink`-authored backup of 40
records restores to "44 of 500". Truncated writes salvage, array-shaped `w` restores, a refused
restore rolls back and keeps the backup byte-for-byte. Zero console and zero page errors across
every run. That work stands.

What fails is everything the rescue net does *not* cover. The store now defends corrupt bytes with a
post-condition, a rollback and a partial-restore report — and defends nothing at all against the
three ways history actually disappears: a full quota, the Reset button, and the Discard link. The
verifier refuted two of the critic's eight findings and found six more, including a total, silent,
user-action-free data loss. No blind judge ran this piece this loop.

## Surviving findings

### 1. MAJOR — the shrink guard is defeated by a full quota, and the loss is silent (verifier-found)
`#keepAside` (`progress.svelte.ts:965`) wraps its `setItem` in a `try/catch` that swallows the
failure — its own comment says "A full quota is exactly when this fails. Nothing better is
available" — it returns `void`, and `#guardShrink` (`:866`) ignores it and lets `flush()` proceed to
`storage.setItem(STORAGE_KEY, mergedText)`. The shrinking write then *succeeds*, precisely because it
is smaller. Reproduced with a genuinely full localStorage (`canCreateBackup:false`,
`canShrink:true`): main key = 10,225 bytes naming 300 L1 words / 1,800 answers under `g:{"1":3}`,
load `/quiz/1`, answer four cards → main key **10,225 → 176 bytes**, `hskquiz:progress:broken` never
created, notice list **empty**, home reads "6 words practised". 300 words and 1,800 answers
destroyed with no copy, no notice and no trace. This is the invariant `#guardShrink`'s own doc
comment states — *"no write may reduce the stored history without first copying the larger side
aside and saying so on screen"* — broken in the one condition the whole apparatus exists for.
`#guardLoss` (`:840`) shares the identical swallowed call. Confirmed at store level with a fake
storage refusing only `BACKUP_KEY`: `flush()` returns `true`, `store.rescue` is `null`.

### 2. MAJOR — the storage warning switches itself off at the moment history is destroyed (verifier-found)
Same run. `#settle()` (`progress.svelte.ts:1051`) unconditionally sets `#status = 'saving'`, and the
shrinking write lands because it is smaller. So the learner's sequence is: "Progress is not being
saved. The browser refused the last write, most likely because its storage is full." → answers a few
cards → **the warning silently disappears** → 1,800 answers gone. The one element on screen that
could have told them anything retracted itself as the loss landed.

### 3. MAJOR — "Discard" destroys the only copy on one unconfirmed tap, styled as the quiet dismiss link
Both critic and verifier reproduced verbatim. Backup seeded with 300 L1 records (10,241 b), main key
holding 2 words. Measured computed styles: "Restore it" = 84×28 px, 1px solid border, white surface —
an outlined pill; "Discard" = 71×28 px, transparent border and background, underlined, `rgb(111,104,92)`
— the quiet text link. One tap: page `dialog` listener captured `[]`, backup 10,241 → absent, notice
unmounts *exactly as it does on success*, reload confirms it is gone forever. `onDiscard()`
(`StorageNotice.svelte:149`) calls `progress.discardRescue()` directly; `discardRescue()`
(`progress.svelte.ts:565`) calls `removeItem` unconditionally with no confirmation anywhere above it.
The learner's only affordance for "close this message I don't understand" is the button that destroys
1,800 answers. The sibling button got a post-condition, a rollback and a partial-restore report; its
destructive twin got nothing.
Shots: `progress/shots/loop-5/ps-discard-before-mobile.png`, `ps-discard-after-mobile.png`.

### 4. MAJOR — Reset erases everything, keeps no copy, and deletes the one that exists
300 L1 + 200 L2 records (17,064 b), home reads "500 words practised · 67% correct". First tap → the
pill reads "Tap again to erase": no count, no "500 words", no "cannot be undone", no dialog. Second
tap ~600 ms later on the same 126×44 px target → main key becomes `{"v":1,"w":{},"l":{},"g":{"0":1}}`
(33 b), `hskquiz:progress:broken` absent before and after, no notice, and a reload confirms every word
is gone with no offer to restore. The verifier ran the stronger variant the critic only inferred: with
a pre-existing 10,213-byte backup on screen as "It holds 300 words · 2,700 answers", two taps on Reset
deleted **that copy too**, silently — `resetAll()` calls `this.discardRescue()` at
`progress.svelte.ts:476`. So a corrupt byte earns a copy and a Restore button; a mis-tap on a phone
gets nothing, and takes the corrupt byte's copy with it.
Shots: `ps-reset-before-mobile.png`, `ps-reset-armed-mobile.png`, `ps-reset-after-mobile.png`.

### 5. MAJOR — a rescue panel goes stale across tabs and then lies about it (verifier-found)
The `storage` listener (`progress.svelte.ts:1242`) returns early on any key that is not `STORAGE_KEY`,
so `BACKUP_KEY` changes are never observed. Two pages in one context, both showing "It holds 300 words
· 1,800 answers". Tab A taps Discard; the key is gone. Tab B keeps the panel indefinitely, still
claiming the copy holds 300 words / 1,800 answers and that "Nothing has been thrown away". Tapping
"Restore it" in Tab B appends "Nothing could be put back — … It has been kept exactly as it was;
nothing was thrown away." Four false statements on screen about a key that does not exist, and the
panel never clears until a reload. Store-level: `restoreRescue()` with a removed `BACKUP_KEY` returns
`false`, leaves `#rescued` non-null, reports `{promised:300, landed:0}`.

### 6. MAJOR — a returning learner's first paint asserts zero progress
Confirmed from the server bytes, so it is build-independent: `curl /` returns HTML containing "Start
here", "0 of 500 practised" and "Progress is kept on this device", and containing neither the "Your
progress" strip nor a Reset button. `+page.svelte` gates `snapshot` on a `hydrated` latch set in an
`$effect`; the strip is behind `{#if summary.started}`; the storage promise renders on
`{#if !hydrated || status === 'saving'}` (`StorageNotice.svelte:44`). With 500 records seeded: warm dev
server shows the zero state ~50–120 ms; under CDP throttling at 20× CPU + 400 kbps/300 ms — an ordinary
mid-range phone on a bad connection — first paint at 566 ms showed "0 of 500" and the storage promise,
and the real strip did not appear until 5,143 ms. The 5.1 s figure is a dev-server module graph and
production would be faster; the SSR-asserts-zero fact is structural and is not. Pleco shows your data
on first paint. Shots: `ps-flash-slowjs-mobile.png` vs `ps-flash-settled-mobile.png`.

### 7. MAJOR — the rescue panel crushes the character being learned, with 28 px destructive controls
`/quiz/1` at question 2/10 with a 300-record backup: `.storage-notice-action` "Restore it" and
"Discard" both at `top=155px`, `height=28px` — under the 44 pt minimum, in the tap path of a running
drill. `.storage-notice-action` sets `min-block-size: 0`, an explicit opt-out. The critic's mechanism
is wrong and the verifier's correction is worse for the app: the panel is 140 px spanning y=57..197
and displaces nothing, because the quiz column is a fixed one-viewport layout — the answer buttons sit
at 444 either way. What it actually does is squeeze the question hero from 158..318 (160 px) to
297..318 (**20 px**), an 8× reduction. The hanzi is crushed to make room for a database-recovery
dialog. Tapping "Restore it" mid-session also folds 300 words into the pool the running session was
already drawn from (main 4,156 → 10,276 b). Shot: `ps-quiz-rescue-mobile.png`.

### 8. MINOR — the level card and the browse page for the same level disagree
`isShippableWordId` (`progress-core.ts:405`) bounds by `LEVEL_SIZES`, so the eight homograph holes are
accepted. Seeded `L2-0340`, `L2-0341`, `L3-0007`: home "3 words practised · 3 mastered · 100%
correct", cards "2 of 770 · 2 mastered" and "1 of 969 · 1 mastered"; `/browse/2` on the same load
"770 All · 769 New · 1 Mastered", `/browse/3` "969 All · 969 New" with no Mastered pip at all.
Verified against the shipped JSON, not the reference: holes at L2-0340/0482, L3-0007/0103/0599/0752,
L4-0556, L5-0559 — 8 in total, `SHIPPED_TOTAL` 4,308 vs `LEVEL_SIZES` 4,316. All eight return `true`.
Shots: `ps-hole-home-mobile.png`, `ps-hole-browse-mobile.png`.

### 9. MINOR — `count()` clamps a hostile payload rather than rejecting it (verifier-found)
`count()` (`progress-core.ts:1266`) returns `Math.min(Math.floor(n), MAX_SAFE_INTEGER)`, so
`[1e308,1e308,1e308,ts,0]` decodes to `seen = correct = streak = 9007199254740991`, survives an
encode/decode round-trip unchanged, and would print as "1 word · 9,007,199,254,740,991 answers" in the
rescue notice and fold into the level card's accuracy. Every other field in the file is bounded by a
plausibility test — `stamp()` has `EPOCH_FLOOR` and a future ceiling, `readGeneration()` *discards*
past `MAX_GENERATION` rather than clamping. The answer counters have none.

### 10. MINOR — `restoreRescue`'s post-condition tests the wrong proposition (verifier-found)
`restoredTotals` counts a rescued id as "landed" whenever a live record with history exists under that
id — not whenever *the copy's* history is now live. So the success test that authorises deleting the
only copy can be satisfied by records that were already there, and cannot detect a restore that put
back the ids but not their content. A backup of 3 records at `seen:40` over live records at `seen:9`
happened to merge correctly (`betterOf` took the maxima), so this is a gap in the check, not an
observed loss — but the check is described in its own comment as "the point of the whole method".

### 11. MINOR — `resetLevel()` is dead destructive surface (verifier-found)
`resetLevel()` (`progress.svelte.ts:432`) is fully implemented and spec-covered, with its own
generation bump and rollback, and has no caller anywhere in `src/routes` or `src/lib` — grep returns
only its definition, two doc comments and its tests. The only wired destructive controls are
`resetAll` (home) and `discardRescue`/`restoreRescue` (StorageNotice).

## Refuted — not gaps

- **"A copy made seconds ago is labelled 'a copy from an earlier visit'."** Refuted, and the stated
  mechanism is impossible. The verifier saw the `'lost'` branch render verbatim on the quiz screen the
  moment `#guardShrink` fired, and it stayed byte-identical through a client-side navigation back to
  `/`. `#noteExistingRescue` is called from exactly one place — `reload()` at `:733` — which is called
  from exactly one place, the constructor at `:288`; `progress` is a module-level singleton and
  SvelteKit client navigation re-evaluates neither. Only a hard reload relabels it, by which point
  "an earlier visit" is accurate. The critic observed only post-hard-navigation.
- **"restoreRescue prints 'Only 0 of 0 words could be put back'."** The `promised`/`landed` denominator
  mismatch at `:521` vs `:519/:540/:553` is real, but the sentence cannot render: `StorageNotice`
  gates that line on `report.landed > 0`, and every path setting `promised = rescued.words` on a
  levels-only rescue also sets `landed = 0`, so the "Nothing could be put back" branch fires instead.
  The verifier built the exact case against the real store and got that branch, then failed to
  construct any post-write partial at all — `restoreInto` stamps everything at the live generation.
  Cosmetic code smell, not a defect on screen.

## Biggest gap

**Make the copy a precondition of the destruction. `#keepAside` must be able to fail loudly, and no
path in this store may reduce or erase stored history unless a readable copy demonstrably survives.**

Right now `#keepAside` returns `void` and swallows its own failure, and not one of the three doors
history leaves by is gated on it. In `src/lib/progress/progress.svelte.ts`:

1. **Give `#keepAside` a `boolean` return** — `true` only when the bytes are now in `BACKUP_KEY` (or
   an equal-or-richer copy already is). Return `false` from the `catch`.
2. **`#guardShrink` and `#guardLoss` return it, and `flush()` obeys it.** When the guard fires and the
   copy did **not** land, do not call `storage.setItem(STORAGE_KEY, …)` at all: call `#failWrite()`
   and return `false`, exactly as the quota path already does for the main key. The answer is safe in
   memory, the session carries on, and the "Progress is not being saved" line stays up instead of
   being cleared by `#settle` on a write that just destroyed 1,800 answers. This is the invariant the
   file already states above `#guardShrink`; today it is documentation, not code.
3. **`resetAll()` and `resetLevel()` keep the outgoing payload.** `#keepAside` the bytes being erased
   *before* clearing state, and delete the `this.discardRescue()` call at `:476`. If the copy cannot
   be written, refuse the erase through `#eraseRefused` rather than erasing uncopied. An erase must
   leave a copy behind, never remove the one that was already there.
4. **`Discard` must cost a second tap, like Reset.** `StorageNotice.svelte:210` arms on the first tap
   to read "Tap again to delete 300 words · 1,800 answers" and only calls `progress.discardRescue()`
   on the second — and name the stakes in Reset's confirm too ("Tap again to erase 500 words", not
   "Tap again to erase"). While in that file, drop the `min-block-size: 0` on
   `.storage-notice-action`: both controls measure 28 px and one of them sits mid-quiz.

**The repro that must pass in a real browser.** Fill `localStorage` until every write throws
(`canCreateBackup:false`, `canShrink:true`), seed `hskquiz:progress:v1` with 300 L1 records at
`seen:6` under `g:{"1":3}`, load `/quiz/1` and answer four cards. The main key must still hold all
10,225 bytes, and the screen must still read "Progress is not being saved" — not 176 bytes and a clean
slate. **Second repro:** seed 300 L1 + 200 L2 records, tap Reset twice, reload → home shows "Earlier
progress was kept aside… It holds 500 words · 3,000 answers" with a Restore button, and tapping it
returns HSK 1 to "300 of 500 practised" and HSK 2 to "200 of 770". **Third:** with a 300-word copy in
`hskquiz:progress:broken`, one tap on Discard leaves those 10,241 bytes exactly where they are.
