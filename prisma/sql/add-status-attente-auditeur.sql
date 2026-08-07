-- Adds the « Attente envoi vers auditeur » workflow status (Status id 6).
--
-- DEMANDE-ONLY, like « Soldé ». It splits an event the system used to collapse
-- into one: le lecteur qui ramène l'enregistrement aux ECA n'est PAS l'auditeur
-- qui le reçoit. Une attribution « Terminé » pousse désormais sa demande en
-- « Attente envoi vers auditeur » et non plus directement en « Terminé », si
-- bien qu'un enregistrement revenu mais jamais expédié reste visible au lieu de
-- se clôturer tout seul et d'être oublié. Fermer la demande redevient un geste
-- humain qui signifie « l'auditeur a été servi » — ce qui fait aussi de sa date
-- de clôture le jour de l'expédition et non celui du retour.
--
-- RUN THIS BEFORE DEPLOYING THE CODE: lib/statusSync.ts references id 6 directly.
--
-- The id is explicit, not auto-generated, so dev and prod agree — STATUS in
-- lib/statusSync.ts hardcodes it. Re-runnable: the insert is a no-op if the row
-- already exists, and the sortOrder updates are idempotent.
--
-- No backfill: every demande already « Terminé » stays « Terminé ». The new
-- state only appears going forward, the first time an attribution is finished
-- after the deploy. Nothing else in the schema changes — Orders.statusId is an
-- ordinary FK to Status.

INSERT INTO "Status" (id, name, description, "sortOrder")
VALUES (6, 'Attente envoi vers auditeur', 'Enregistrement revenu du lecteur, en attente d''envoi vers l''auditeur', 3)
ON CONFLICT (id) DO NOTHING;

-- The new status sits BETWEEN « En cours » (2) and « Terminé », so the two
-- statuses above it shift down one. sortOrder only drives selector/filter
-- ordering — no behaviour depends on it.
UPDATE "Status" SET "sortOrder" = 4 WHERE id = 3;  -- Terminé
UPDATE "Status" SET "sortOrder" = 5 WHERE id = 4;  -- Soldé

-- An explicit id doesn't advance the identity sequence: without this, the next
-- auto-generated Status id would collide with an existing row.
SELECT setval(pg_get_serial_sequence('"Status"', 'id'), (SELECT MAX(id) FROM "Status"));

-- Sanity check after running:
--   SELECT id, name, "sortOrder" FROM "Status" ORDER BY "sortOrder";
