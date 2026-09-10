---
paths:
  - "app/**"
  - "lib/**"
  - "components/**"
  - "content/aide/**"
---

## The mode d'emploi follows the code (IMPORTANT)

`content/aide/*.md` is the **single source** for the user guide. It renders two ways: the
in-app help section at `/admin/aide/<slug>`, and the printable guide handed to new
permanents. There is no second copy to keep in step — the old Google Doc is retired, and
`user_guide/*.pdf|docx` is the frozen original, kept for reference only. **Never edit those
two files; never treat them as the source.**

**Changing a documented flow means updating its section in the same commit.** Prose drift
cannot be caught by a build check, so it is caught here instead. The audit that seeded these
files found the guide describing a two-month late rule that was thirty days, a flat 3 € tariff
that had become 3 € per CD, and a « Don » that no longer accepted an anonymous donor — each
one shipped by a change that did not think to look at the guide.

Concretely, when a change touches any of these, open the matching file:

| What you changed | Section |
|---|---|
| bill states, seuil, late rule, PDF export | `08-factures.md` |
| order cost/pricing, statuses, deletion rules | `06-demandes.md` |
| assignment dates, guards, réattribution | `07-attributions.md` |
| payment types, methods, required client | `09-paiements.md` |
| book form, genres, audio editor | `03-catalogue.md`, `04-genres.md` |
| listes de livres, nouveautés window | `05-liste-de-livres.md` |
| member types, access levels, dossier, statuts | `10-membres.md` |
| availability, calendrier, reader load | `11-disponibilites.md` |
| doublons / fusion, audio orphelin | `12-doublons.md`, `13-audio-orphelin.md` |
| public site content (news, contact, équipe…) | `14-pages-publiques.md` |
| stats, journal des modifications | `15-statistiques.md` |
| profile, own unavailability, own activity | `16-mon-compte.md` |

Rules that keep it honest:

- **Anchor on slugs, never on page numbers.** Links point at `/admin/aide/<slug>#<heading>`;
  a heading survives an edit, a page number does not.
- `pnpm aide:check` verifies every `<AideLink section="…">` in the app resolves to a section
  that exists. Run it after adding or renaming one — a broken help link is a silent one.
- The printable guide is **generated, never stored**: `/admin/aide/pdf` renders the same
  Markdown through `@react-pdf/renderer` (button on `/admin/aide`). Two traps live in
  `components/aide/AideGuidePDF.tsx`, both commented there — a `fixed` element carrying
  `render={({ pageNumber }) => …}` kills the render past ~20 screenshots, and an `Image`
  without explicit width/height is laid out at its intrinsic pixel size and overflows the
  page. `pnpm aide:shots` recaptures screenshots, `pnpm aide:annotate` draws the numbered
  markers.
- Screenshots live in `content/aide/images/` and are served by the guarded route
  `app/admin/aide/images/[name]` — deliberately **not** `public/`, which the middleware
  does not cover. If your change alters what a screenshot shows, either
  recapture it or say so in the section — a picture that contradicts the text is worse than
  no picture.
- Keep the French in house style: « aux ECA », *demande* never *commande*, *attribution*
  never *affectation*.
