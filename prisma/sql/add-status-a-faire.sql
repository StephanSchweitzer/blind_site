-- Adds the « À faire » workflow status (Status id 5).
--
-- « À faire » is DUPLICATION-ONLY. A duplication owns no attribution, so the
-- recording statuses say nothing true about it — « En cours » in particular used
-- to be set automatically and read as though the book were being recorded.
-- A duplication now has a two-state lifecycle, « À faire » → « Terminé »,
-- enforced by guardDuplicationStatus in lib/statusSync.ts.
--
-- RUN THIS BEFORE DEPLOYING THE CODE: lib/statusSync.ts references id 5 directly.
--
-- The id is explicit, not auto-generated, so dev and prod agree — STATUS in
-- lib/statusSync.ts hardcodes it. Re-runnable: the insert is a no-op if the row
-- already exists.
--
-- No backfill needed: every existing duplication is already at « Terminé ».
-- Verify before running if you want to be sure:
--   SELECT s.name, count(*) FROM "Orders" o
--   JOIN "Status" s ON s.id = o."statusId"
--   WHERE o."isDuplication" GROUP BY s.name;

INSERT INTO "Status" (id, name, description, "sortOrder")
VALUES (5, 'À faire', 'Duplication à effectuer', 0)
ON CONFLICT (id) DO NOTHING;

-- An explicit id doesn't advance the identity sequence: without this, the next
-- auto-generated Status id would collide with an existing row.
SELECT setval(pg_get_serial_sequence('"Status"', 'id'), (SELECT MAX(id) FROM "Status"));
