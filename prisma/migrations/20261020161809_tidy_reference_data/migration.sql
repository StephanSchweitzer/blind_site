-- Données de référence : deux restes de l'import, rien que Prisma ne voie.

-- « MD » (MiniDisc) : un format qu'aucune demande n'emploie plus. Supprimé
-- seulement si rien ne le désigne — ni une demande (Orders.mediaFormatId), ni
-- une préférence de membre (User.preferredMediaFormatId) — : une base où il
-- servirait encore le garde tel quel, et une base où il n'existe pas ne
-- change pas.
DELETE FROM "MediaFormat" m
WHERE m."name" = 'MD'
  AND NOT EXISTS (SELECT 1 FROM "Orders" o WHERE o."mediaFormatId" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."preferredMediaFormatId" = m."id");

-- « FRANCE » en capitales venait de l'import ; le formulaire écrit « France ».
-- Une seule graphie, pour que les étiquettes et les filtres ne voient qu'un pays.
UPDATE "Address" SET "country" = 'France' WHERE "country" = 'FRANCE';
