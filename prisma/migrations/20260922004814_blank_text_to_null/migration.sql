-- Une colonne texte facultative vide s'écrit null, jamais '' (lib/blank-to-null.ts).
--
-- Des routes enregistraient '' (création d'un livre, d'une fiche sans nom,
-- modification d'une Liste des Livres, import Access). Les formulaires de
-- modification envoient null pour un champ vide : la première sauvegarde d'une
-- telle fiche « changeait » donc un champ que personne n'avait touché, et le
-- journal montrait « Sous-titre : (vide) → — ». Les routes sont corrigées ; ceci
-- range les chaînes vides déjà stockées.
--
-- SQL brut, donc hors journal d'audit, volontairement : c'est un nettoyage, pas
-- une décision, et un millier d'événements identiques ne dirait rien de plus.
-- Aucune table en ajout seul n'est touchée (UserActivityEvent, AuditEvent…), ni
-- les colonnes écrites par la machine (password, audio_filepath, polly_audio_url).
-- Seules les lignes vides (ou faites d'espaces) changent ; @updatedAt ne bouge pas.

UPDATE "User" SET "email" = NULL WHERE "email" ~ '^\s*$';
UPDATE "User" SET "name" = NULL WHERE "name" ~ '^\s*$';
UPDATE "User" SET "firstName" = NULL WHERE "firstName" ~ '^\s*$';
UPDATE "User" SET "lastName" = NULL WHERE "lastName" ~ '^\s*$';
UPDATE "User" SET "homePhone" = NULL WHERE "homePhone" ~ '^\s*$';
UPDATE "User" SET "cellPhone" = NULL WHERE "cellPhone" ~ '^\s*$';
UPDATE "User" SET "gestconteNotes" = NULL WHERE "gestconteNotes" ~ '^\s*$';
UPDATE "User" SET "nonProfitAffiliation" = NULL WHERE "nonProfitAffiliation" ~ '^\s*$';
UPDATE "User" SET "terminationReason" = NULL WHERE "terminationReason" ~ '^\s*$';
UPDATE "User" SET "availabilityNotes" = NULL WHERE "availabilityNotes" ~ '^\s*$';
UPDATE "User" SET "specialization" = NULL WHERE "specialization" ~ '^\s*$';
UPDATE "User" SET "notes" = NULL WHERE "notes" ~ '^\s*$';
UPDATE "User" SET "civilityOther" = NULL WHERE "civilityOther" ~ '^\s*$';
UPDATE "Address" SET "addressLine1" = NULL WHERE "addressLine1" ~ '^\s*$';
UPDATE "Address" SET "addressSupplement" = NULL WHERE "addressSupplement" ~ '^\s*$';
UPDATE "Address" SET "city" = NULL WHERE "city" ~ '^\s*$';
UPDATE "Address" SET "postalCode" = NULL WHERE "postalCode" ~ '^\s*$';
UPDATE "Address" SET "stateProvince" = NULL WHERE "stateProvince" ~ '^\s*$';
UPDATE "Book" SET "isbn" = NULL WHERE "isbn" ~ '^\s*$';
UPDATE "Book" SET "subtitle" = NULL WHERE "subtitle" ~ '^\s*$';
UPDATE "Book" SET "publisher" = NULL WHERE "publisher" ~ '^\s*$';
UPDATE "Book" SET "description" = NULL WHERE "description" ~ '^\s*$';
UPDATE "Genre" SET "description" = NULL WHERE "description" ~ '^\s*$';
UPDATE "CoupsDeCoeur" SET "description" = NULL WHERE "description" ~ '^\s*$';
UPDATE "Status" SET "description" = NULL WHERE "description" ~ '^\s*$';
UPDATE "MediaFormat" SET "description" = NULL WHERE "description" ~ '^\s*$';
UPDATE "Bill" SET "paymentReference" = NULL WHERE "paymentReference" ~ '^\s*$';
UPDATE "Payment" SET "paymentReference" = NULL WHERE "paymentReference" ~ '^\s*$';
UPDATE "Payment" SET "receiptNumber" = NULL WHERE "receiptNumber" ~ '^\s*$';
UPDATE "Payment" SET "fiscalite" = NULL WHERE "fiscalite" ~ '^\s*$';
UPDATE "Payment" SET "comptable" = NULL WHERE "comptable" ~ '^\s*$';
UPDATE "Payment" SET "observations" = NULL WHERE "observations" ~ '^\s*$';
UPDATE "Payment" SET "deletionReason" = NULL WHERE "deletionReason" ~ '^\s*$';
UPDATE "Orders" SET "notes" = NULL WHERE "notes" ~ '^\s*$';
UPDATE "Assignment" SET "notes" = NULL WHERE "notes" ~ '^\s*$';
UPDATE "AssignmentReader" SET "notes" = NULL WHERE "notes" ~ '^\s*$';
UPDATE "SiteContact" SET "orgSubtitle" = NULL WHERE "orgSubtitle" ~ '^\s*$';
UPDATE "SiteContact" SET "metroText" = NULL WHERE "metroText" ~ '^\s*$';
UPDATE "SiteContact" SET "busText" = NULL WHERE "busText" ~ '^\s*$';
UPDATE "SiteContact" SET "visitText" = NULL WHERE "visitText" ~ '^\s*$';
UPDATE "TeamMember" SET "role" = NULL WHERE "role" ~ '^\s*$';
UPDATE "MembershipOption" SET "highlightLabel" = NULL WHERE "highlightLabel" ~ '^\s*$';
UPDATE "MembershipOption" SET "highlightValue" = NULL WHERE "highlightValue" ~ '^\s*$';
UPDATE "MembershipOption" SET "bullets" = NULL WHERE "bullets" ~ '^\s*$';
UPDATE "MembershipOption" SET "ctaLabel" = NULL WHERE "ctaLabel" ~ '^\s*$';
UPDATE "MembershipOption" SET "ctaHref" = NULL WHERE "ctaHref" ~ '^\s*$';
