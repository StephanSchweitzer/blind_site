-- Une date de paiement vide veut désormais dire « pas encore reçu »
-- (lib/payments/status.ts, RECEIVED_PAYMENT_WHERE).
--
-- Jusqu'ici, tout paiement actif valait encaissement, et une date de paiement
-- absente retombait à la lecture sur la date de création (summarizeBillPayments,
-- lib/cotisation.ts, le filtre « à jour » des membres). Les paiements concernés
-- reçoivent ici exactement cette date-là : ce que l'application leur prêtait
-- devient ce qui est écrit, et aucun total, aucune cotisation, aucune facture ne
-- change de valeur.
--
-- Tous les paiements, supprimés compris : la règle « encaissé = daté » doit tenir
-- sur la table entière, y compris pour une ligne qu'on réactiverait.
--
-- Migration de données seule — aucun changement de schéma. Le journal des
-- modifications (AuditEvent) ne la voit pas : c'est voulu, rien n'a changé de sens.

UPDATE "Payment"
SET "paymentDate" = "creationDate"
WHERE "paymentDate" IS NULL;
