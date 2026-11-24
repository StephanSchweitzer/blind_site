# UI / UX review — Arbre Rose and the public site

Date: 2026-11-24. Scope: the back office (`app/admin`, `components/ui/admin`) and the public
site (`app/(public)`). Method: read the shared pieces and the main entry pages, then searched
every page for common problems. Nothing was changed in the code.

## What is already in good shape

- **One admin kit, used everywhere.** Pages share `AdminPageHeader`, `AdminEmptyState`,
  `AdminPaginatedList`, `MobileFilters`, `AdminCard` and `useConfirm()`. Consistency is the
  biggest strength, and the new-page checklist can point at these.
- **No native `window.confirm` / `alert` left.** Every confirmation goes through the styled
  `ConfirmDialog`, which also supports typing a number before an irreversible delete.
- **The dashboard reads as a to-do list.** The « En ce moment » band counts only what someone
  can act on, colours are amber/blue/green (never red, never « en retard »), and each line opens
  the list it counts.
- **Every admin page sets its own tab title** (`Demandes — Arbre Rose`), which helps when
  several back-office tabs are open.
- **Search that recovers from zero results** (« Essayez plutôt », `lib/search-rescue.ts`).
- **Accessibility basics are present:** skip links, a `<main>` landmark, `sr-only` headings and
  about 67 `aria-label` / `sr-only` uses across the admin UI.
- **Colour is not the only signal.** Public links are underlined; statuses carry text labels.

## Priority 1 — text is too small for the readers this site serves

The site is for blind and low-vision people and for volunteers who work with a magnifier. The
code uses very small text heavily:

- `text-xs` or 9–11 px text: **about 206 occurrences in 33 admin files**, and about 4 on the
  public site.
- The heaviest files are `person-availability-panel.tsx` (22), `availability-dashboard.tsx`
  (21), `audit-timeline.tsx` (17), `trash-client.tsx` (16), `orphans-client.tsx` (16),
  `books-table.tsx` (13) and `payments-table.tsx` (12).

**How to improve:** make `text-sm` (14 px) the smallest size for table cells, badges and
helper text in the back office, and keep `text-xs` only for badges. Check whether the
existing display setting (`components/AffichageSettings.tsx`) already scales text; if it does,
these cells should follow it. I did not check that setting, so verify it first.

## Priority 2 — the dashboard is long for a daily home page

`app/admin/page.tsx` has six sections, about 23 cards, a post-it board and the to-do band.
Several sections repeat the side menu (« Gestion », « Membres », « Livres »). The page says this
is deliberate, which is reasonable for a first visit, but the total length works against
scanning.

**How to improve:**
- Keep « En ce moment » and the post-its at the top. They are the real daily work.
- Collapse « Livres », « Gestion » and « Membres » into one « Accès rapides » section, or hide
  it behind a toggle that remembers its state.
- Move « Pages du site » (super admin only) out of the daily home page into a separate content group of the menu,
  so the dashboard holds only what staff use every day.

## Priority 3 — jargon in filters and labels

The Demandes « Type » filter uses internal terms that new volunteers may not know:
« Duplication réalisable », « Duplication après enregistrement », « Duplication sans
enregistrement prévu ». The same jargon reaches the dashboard lines.

**How to improve:** add a one-line explanation under the filter (or a `title` / info popover
that links to the matching section of the mode d'emploi via `AideLink`). Use the mode
d'emploi's own wording so the guide and the screen match. Keep the terms, since they are the
project's vocabulary.

## Priority 4 — too many confirmation steps in one place

`components/ui/admin/BookAudioModal.tsx` opens up to four `confirm()` dialogs in one flow
(lines ~723, 909, 954, 969). Stacked confirmations are hard to follow with a screen reader.

**How to improve:** group the choices in one dialog where possible (« Que voulez-vous
faire ? » with clear buttons), and keep the typed-number confirmation only for the truly
irreversible deletions.

## Priority 5 — small code-level fixes (no visible change for most users)

- `components/ui/admin/CloseOrderTodayButton.tsx` sets both `title` and `aria-label` to the same
  long text. The `title` was dropped, keeping the `aria-label`. (An earlier version of this
  report suggested removing the `<span onClick>` wrapper too. That was wrong: a comment in the
  file explains that React passes clicks from the print dialog up the component tree, so the
  wrapper stops them reaching the row. It stays.)

## Changes made (after this review)

Priority 2 (dashboard) was left alone, as requested.

- **Priority 1 — small text.** `text-xs` became `text-sm` in helper text, table cells and
  metadata across 55 admin files. Left as they were: badges and pills (`rounded-full`,
  `Badge`), and the availability timeline grid, whose fixed cells would overflow. The back
  office does not follow the public text-size setting (`app/globals.css`, the comment above
  `[data-taille-texte]`), so these changes are the only text-size change in the admin. Tables
  are a little taller as a result; check them on a real screen.
- **Priority 3 — Type filter.** The Demandes « Type » filter now shows one line under the
  select, explaining the duplication option that is picked (`TYPE_AIDE` in
  `app/admin/orders/orders-table.tsx`). The select points to it with `aria-describedby`.
- **Priority 4 — stacked confirmations.** Closing the audio editor during a running archive
  and with unsent files used to show two dialogues in a row. It now shows one, listing both
  reasons (`handleOpenChange` in `components/ui/admin/BookAudioModal.tsx`). The replace and
  memory-warning confirmations were already single.
- **Priority 5 — close button.** The duplicate `title` was removed (see the corrected item
  above).

**Checks:** `eslint` on the changed files reports no errors (one existing warning in
`books-table.tsx`, not touched here). `tsc --noEmit` passes. Nothing is committed.

**Not checked:** the changes were not viewed in the browser. The admin needs the dev server
and the local dev sign-in, and the memory note on `.env` asks for the database host to be
confirmed first, so I did not start the server.

## What I did not check, and why

- **Visual layout and colour contrast in a real browser.** I did not start the dev server. Run
  `pnpm a11y:check` and open the pages in the preview to confirm the findings above.
- **Most of the large forms** (Demande, Attribution, Facture, Fiche livre) were not read line
  by line. Only the shared pieces, the dashboard, the Demandes entry page and the Users table
  were read in full.
- **The public catalogue, listes and footer** were not read in full, beyond the home page
  opening.

## Suggested order of work

1. Raise the minimum text size in the back-office tables and badges (Priority 1).
2. Trim the dashboard and move « Pages du site » out of it (Priority 2).
3. Add one-line explanations to the Demandes « Type » filter (Priority 3).
4. Merge the stacked confirmations in the audio editor (Priority 4).
5. Tidy the close button (Priority 5).

Each step is a small, separate change, which keeps the visual review easy.
