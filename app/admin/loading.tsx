import { LoadingSkeleton } from '@/components/loading-skeleton';

// Pas « du tableau de bord » : ce repli sert aussi à chaque page /admin sans
// loading.tsx à elle (factures, paiements, doublons…), et le survol d'un lien le
// précharge pour l'afficher dès le clic (components/admin/IntentLink.tsx).
export default function Loading() {
    return <LoadingSkeleton variant="admin" />;
}
