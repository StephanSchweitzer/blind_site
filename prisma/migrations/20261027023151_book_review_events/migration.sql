-- CreateEnum
CREATE TYPE "BookReviewAction" AS ENUM ('FUSION', 'DISMISS', 'DELETE');

-- CreateTable
CREATE TABLE "BookReviewEvent" (
    "id" SERIAL NOT NULL,
    "action" "BookReviewAction" NOT NULL,
    "bookId" INTEGER NOT NULL,
    "otherBookId" INTEGER,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookReviewEvent_createdAt_idx" ON "BookReviewEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "BookReviewEvent" ADD CONSTRAINT "BookReviewEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Reprise de l'historique ─────────────────────────────────────────────────
-- Sans elle, « Doublons traités » partirait de zéro le jour du déploiement, et
-- le travail déjà fait dans la file resterait invisible sur /admin/stats.
--
-- FUSION : BookMergeEvent est permanent, tout l'historique est repris.
-- DISMISS / DELETE : seul le journal des modifications (AuditEvent) en garde
-- une trace, et il est purgé après 14 jours — on reprend donc ce qu'il en
-- reste, rien de plus ancien n'existe.
--   - DISMISS : une mise à jour de Book qui fait passer « à vérifier » de vrai
--     à faux. Seules dismissReview et fuseBooks écrivent ce champ ; la fusion
--     se reconnaît à son BookMergeEvent sur le même livre, à la minute près.
--   - DELETE : une suppression douce (deletedAt null → date) d'un livre encore
--     signalé. Les suppressions depuis le catalogue passent par le même code et
--     ne se distinguent pas dans le journal : on ne retient que les livres
--     encore « à vérifier », ceux que la file affichait. Une fusion, elle,
--     efface physiquement le doublon (opération DELETE) et n'est pas comptée ici.
INSERT INTO "BookReviewEvent" ("action", "bookId", "otherBookId", "performedById", "createdAt")
-- Le journal ne tient pas de clé étrangère sur son auteur : un id qui ne
-- désigne plus personne devient NULL (« Système ») plutôt que de faire échouer
-- la migration.
SELECT action, "bookId", "otherBookId",
       (SELECT u."id" FROM "User" u WHERE u."id" = history."performedById"),
       "createdAt"
FROM (
    SELECT 'FUSION'::"BookReviewAction" AS action,
           m."canonicalId" AS "bookId",
           m."duplicateId" AS "otherBookId",
           m."performedById",
           m."createdAt"
    FROM "BookMergeEvent" m

    UNION ALL

    SELECT 'DISMISS'::"BookReviewAction",
           a."recordId"::int,
           NULL,
           a."actorId",
           a."createdAt"
    FROM "AuditEvent" a
    WHERE a."model" = 'Book'
      AND a."operation" = 'UPDATE'
      AND a."changes" -> 'needsReview' = '[true, false]'::jsonb
      AND NOT EXISTS (
          SELECT 1 FROM "BookMergeEvent" m
          WHERE m."canonicalId" = a."recordId"::int
            AND m."createdAt" BETWEEN a."createdAt" - interval '1 minute'
                                  AND a."createdAt" + interval '1 minute'
      )

    UNION ALL

    SELECT 'DELETE'::"BookReviewAction",
           a."recordId"::int,
           NULL,
           a."actorId",
           a."createdAt"
    FROM "AuditEvent" a
    JOIN "Book" b ON b."id" = a."recordId"::int
    WHERE a."model" = 'Book'
      AND a."operation" = 'UPDATE'
      AND a."changes" ? 'deletedAt'
      AND a."changes" -> 'deletedAt' ->> 0 IS NULL
      AND a."changes" -> 'deletedAt' ->> 1 IS NOT NULL
      AND b."needsReview" = true
) AS history
ORDER BY "createdAt";
