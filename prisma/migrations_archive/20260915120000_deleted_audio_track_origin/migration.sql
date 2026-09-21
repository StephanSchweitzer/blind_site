-- Qui était le livre, quand il n'y en a plus.
--
-- DeletedAudioTrack.bookId est onDelete: SetNull, et le seul lecteur de la
-- corbeille filtre sur bookId : une piste supprimée depuis une fiche ensuite
-- supprimée devenait invisible de tous les écrans, pendant que la purge
-- nocturne (lib/audio/purge.ts) effaçait l'objet pour de bon au bout de
-- 14 jours sans regarder ce null.
--
-- Deux colonnes nullables, sans clé étrangère (c'est le but : elles doivent
-- survivre au livre). Écrites par markTrashOrigin (lib/audio/trash.ts).
ALTER TABLE "DeletedAudioTrack" ADD COLUMN     "originBookId" INTEGER,
ADD COLUMN     "originBookTitle" TEXT;
