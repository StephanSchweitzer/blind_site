---
paths:
  - "lib/audio/**"
  - "app/api/books/*/audio/**"
  - "app/admin/audio-orphelins/**"
---

### Audio storage (`lib/audio/`) — handle with care

The recordings are frequently the **only copy in existence**. Every rule here exists because
of that.

- **Import `./bucket`, never `./bucket-core`.** The `-core` files (`bucket-core.ts`,
  `measure-core.ts`) deliberately omit `import 'server-only'` so the `scripts/` can run them
  under plain Node. App code must go through the guarded wrapper, which is what turns an
  accidental client import into a build error. Don't add a second implementation of anything
  in a script — that's how a backfill and a button end up disagreeing.
- **`refreshBookAudioState()` (`lib/audio/state.ts`) is the single writer** of
  `Book.audioLinkStatus` / `audioTrackCount` / `audioSizeKb` / `audioCheckedAt` /
  `readingDurationMinutes`. Every mutating audio path calls it. Don't write those columns
  from a route, and don't skip the call.
- **A duration that moves invalidates the spoken announcement.** `/api/polly` reads the
  reading duration into the text it synthesizes, so `refreshBookAudioState` clears
  `Book.polly_audio_url` when — and only when — `readingDurationMinutes` actually changes.
  (`PUT /api/books/[id]` does the same for title, author and description.) Keep the
  "only on a real change" condition: this function runs on every dialogue open, and clearing
  the cache on a mere re-read would re-synthesize, and re-pay for, the whole catalogue.
  Both columns are `DERIVED_FIELDS` (`lib/audit/config.ts`), which is what lets that write
  stay inside `withoutAudit` without losing a journal entry.
- **Deleting a book does NOT trash its audio, and no longer deletes the row either.**
  `deleteBookWithAudio` (`lib/books/`) sets `Book.deletedAt` — a soft delete, hidden from every
  list read by the `lib/prisma.ts` extension, restorable without a time limit — rather than
  ever calling `prisma.book.delete`. The audio disposition on top is still an explicit choice:
  *laisser le dossier* (default: nothing is copied and nothing is queued anywhere —
  `audio_filepath` stays on the fiche, which still claims it), *transférer* (the target book's
  `audio_filepath` is repointed, refused when it already holds tracks, and its
  `AudioTrackDuration` cache rows move with the folder), or *envoyer à la corbeille* (the old
  behaviour, now opt-in and gated on the track count). `readBookDeletionCheck`
  (`lib/books/deletionPreflight.ts`) is the one place the refusals are computed, read both by
  the confirmation dialogue and by the DELETE route.
- **Two ways back, and they don't do the same work.** `POST /api/books/[id]/restore` is the
  ordinary undo of a `deleteBookWithAudio` soft delete: it lifts `deletedAt` and restores
  **only the corbeille tracks the permanent ticked** (`restoreTracksByIds`) — never "everything
  the corbeille holds for this book", which includes bad takes deliberately removed weeks
  earlier. `readBookRestorePreview` (`lib/books/restorePreview.ts`) proposes the tracks trashed
  *with* the deletion (ticked) apart from older ones (unticked), and refuses when a live book
  now holds the same ISBN. No reattachment needed, because the row never actually left and
  `DeletedAudioTrack.bookId` was never detached from it (see the next bullet).
  `reattachAudioAfterBookRestore` (`lib/books/restoreBookAudio.ts`) is for the other case,
  where the book row really was gone — a real `DELETE` (`scripts/delete-duplicate-book.ts` is
  the current one) — and gets recreated at the same id: `/admin/stats` does this, replaying a
  deletion less than 14 days old from the journal. It hands the now-anonymous corbeille rows
  back and drops the folder from the orphan queue, touching only rows nobody else claimed
  (`bookId: null`) and an orphan row nobody has decided on. A fusion never needs this — it
  reassigns the removed book's corbeille to the survivor before deleting the row (see below),
  so there's nothing left anonymous to reattach.
- **Every path that deletes a `Book` row must call `markTrashOrigin` first** (`./trash.ts`), or
  stamp the same two columns by hand (`scripts/delete-duplicate-book.ts`). `DeletedAudioTrack
  .bookId` is `SetNull`, but that constraint only fires on a real row `DELETE` — a
  `deleteBookWithAudio` soft delete never triggers it, so `bookId` stays pointed at the
  (hidden, restorable) book through `trash`/`leave`/`transfer` alike, and
  `originBookId`/`originBookTitle` are written anyway, ready for the day the row is really
  deleted. Only an actual `DELETE` (`scripts/delete-duplicate-book.ts`) anonymizes the rows for
  real — invisible on every screen except by `originBookId`, while the nightly purge still
  deletes their objects at 14 days. A fusion reassigns them to the survivor instead, before its
  own `DELETE` runs, so they never go anonymous at all. All corbeille rows, with or without a
  book, are visible on `/admin/audio-corbeille`.
- **Never delete a bucket object directly.** Removal goes through `softDeleteTrack` /
  `softDeleteTracks`: copy to `corbeille/`, verify the copy at the right size, write the
  `DeletedAudioTrack` row, *then* remove the original. The only real deletion is the nightly
  retention purge (`lib/audio/purge.ts`). Rename is the same copy-verify-delete sequence —
  S3/B2 has no rename primitive.
- **Re-check every client-supplied key** with `resolvePrefix` + `isKeyInsidePrefix` at each
  write entry point. The browser sends back keys it got from a listing; a crafted request
  must not be able to name another book's track.
- **Never rename an existing key automatically.** Playback order comes from `naturalCompare`
  over the whole filename, and the corpus has no uniform track numbering. New uploads are
  named by `nextTrackName` (`lib/audio/naming.ts`), which guarantees the name **sorts after**
  the folder's current last track or throws. A track that sorts into the middle plays an
  audiobook's chapters out of order — so no upload, backfill or repair path may rewrite a name
  as a side effect. The one deliberate rename is a human act: `PATCH
  /api/books/[id]/audio/track` → `renameTrack` (`lib/audio/rename.ts`), for the case where the
  filename is *itself* what puts the track out of order. It keeps the extension, refuses an
  occupied key, and makes the admin echo back the exact current name.
- **AppleDouble stubs (`._name.ext`) are not tracks.** Filter with `isAudioKey` on read and
  refuse with `isAppleDoubleName` on write — both directions, one definition.
- **Bytes never transit Vercel.** Uploads are presigned PUTs straight to B2 (`upload-url` →
  browser PUT → `commit`); downloads and the folder zip are presigned GETs. Don't add a route
  that proxies audio.
- **B2 answers a share of requests with 5xx by design.** Anything that loops over objects
  needs retry/backoff (`lib/audio/measure-core.ts`, `hooks/useAudioUpload.ts`) and bounded
  concurrency (`pool` from `lib/concurrency.ts`) — not an unbounded `Promise.all`.
- Durations are read from **header bytes** (`lib/audio/duration-probe.ts`), cached in
  `AudioTrackDuration` keyed on filename **and size**. `Book.readingDurationMinutes` is only
  written when **every** current track resolves — a partial sum silently understates a
  recording that reaches the public catalogue.
