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
- **Never delete a bucket object directly.** Removal goes through `softDeleteTrack` /
  `softDeleteTracks`: copy to `corbeille/`, verify the copy at the right size, write the
  `DeletedAudioTrack` row, *then* remove the original. The only real deletion is the nightly
  retention purge (`lib/audio/purge.ts`). Rename is the same copy-verify-delete sequence —
  S3/B2 has no rename primitive.
- **Re-check every client-supplied key** with `resolvePrefix` + `isKeyInsidePrefix` at each
  write entry point. The browser sends back keys it got from a listing; a crafted request
  must not be able to name another book's track.
- **Never rename existing keys.** Playback order comes from `naturalCompare` over the whole
  filename, and the corpus has no uniform track numbering. New uploads are named by
  `nextTrackName` (`lib/audio/naming.ts`), which guarantees the name **sorts after** the
  folder's current last track or throws. A track that sorts into the middle plays an
  audiobook's chapters out of order.
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
