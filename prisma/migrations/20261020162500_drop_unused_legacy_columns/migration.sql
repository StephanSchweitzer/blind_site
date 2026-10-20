-- Colonnes héritées de l'import Access / Gestconte que plus rien ne lit.
--
-- User.role précédait accessLevel / memberType : seule la session le recopiait,
-- et rien ne le consultait. terminationDate / terminationReason ont été
-- remplacés par activityStatus et l'historique UserActivityEvent (le motif y
-- est dans UserActivityEvent.reason). Book.stock_date et last_downloaded_date
-- n'ont jamais été affichés ni écrits par le site.
--
-- Leur contenu (dates de fin et motifs importés, dates de stock) disparaît avec
-- elles : cette migration n'est à appliquer qu'une fois l'import abandonné pour
-- de bon. Ni la vue search_vocabulary ni le déclencheur user_search_key ne les
-- lisent ; si une autre vue les lisait, Postgres refuserait le DROP plutôt que
-- de la casser.

-- AlterTable
ALTER TABLE "Book" DROP COLUMN "last_downloaded_date",
DROP COLUMN "stock_date";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
DROP COLUMN "terminationDate",
DROP COLUMN "terminationReason";
