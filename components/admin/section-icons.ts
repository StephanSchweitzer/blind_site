import {
    BookOpen,
    Theater,
    Newspaper,
    List,
    ShoppingCart,
    UserCheck,
    Headphones,
    FileText,
    Mic,
    Copy,
    HeartHandshake,
    FolderX,
    CreditCard,
    KeyRound,
    CalendarClock,
    MapPin,
    Users,
    History,
    Info,
    Handshake,
    BarChart3,
    Trash2,
    type LucideIcon,
} from 'lucide-react';

/**
 * One icon per back-office section, keyed by the section's label — shared by
 * the dashboard cards and the navigation menu, so a section looks the same in
 * both. The menu used emoji before, which every OS draws differently and some
 * screen readers announce (« livres empilés ») unless each one is hidden.
 */
export const SECTION_ICONS: Record<string, LucideIcon> = {
    'Catalogue': BookOpen,
    'Genres': Theater,
    'Dernières infos': Newspaper,
    'Listes de livres': List,
    'Doublons': Copy,
    'Demandes': ShoppingCart,
    'Attributions': UserCheck,
    'Factures': FileText,
    'Lecteurs': Mic,
    'Auditeurs': Headphones,
    'Donateurs': HeartHandshake,
    'Audio orphelin': FolderX,
    'Corbeille audio': Trash2,
    'Paiements': CreditCard,
    'Permanents': KeyRound,
    'Disponibilités': CalendarClock,
    'Contact': MapPin,
    'Équipe': Users,
    'Historique': History,
    'Infos pratiques': Info,
    'Nous rejoindre': Handshake,
    'Statistiques': BarChart3,
};
