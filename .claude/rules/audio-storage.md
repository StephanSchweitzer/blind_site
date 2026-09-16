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
- **Deleting a book does NOT trash its audio.** `deleteBookWithAudio` (`lib/books/`) makes it
  an explicit decision — *laisser le dossier* (default: nothing is copied, the folder is queued
  in `OrphanAudioFolder` and shows up on `/admin/audio-orphelins`), *transférer* (the target
  book's `audio_filepath` is repointed, refused when it already holds tracks, and its
  `AudioTrackDuration` cache rows move with the folder), or *envoyer à la corbeille* (the old
  behaviour, now opt-in and gated on the track count). `readBookDeletionCheck`
  (`lib/books/deletionPreflight.ts`) is the one place the refusals are computed, read both by
  the confirmation dialogue and by the DELETE route.
- **A book restored from the journal takes its audio back.** `/admin/stats` replays a deletion
  at the record's original id, so `reattachAudioAfterBookRestore`
  (`lib/books/restoreBookAudio.ts`) hands the corbeille rows back and drops the folder from the
  orphan queue — the mirror of `markTrashOrigin` + `queueOrphanFolder`. It only ever touches
  rows nobody else claimed (`bookId: null`) and an orphan row nobody has decided on.
- **Every path that deletes a `Book` row must call `markTrashOrigin` first** (`./trash.ts`), or
  stamp the same two columns by hand (`scripts/delete-duplicate-book.ts`).
  `DeletedAudioTrack.bookId` is `SetNull`, so without `originBookId`/`originBookTitle` the rows
  go anonymous — invisible on every screen while the nightly purge still deletes their objects
  at 14 days. A fusion is the exception: it reassigns them to the survivor. All corbeille rows,
  with or without a book, are visible on `/admin/audio-corbeille`.
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
