'use client';
import React from 'react';
import { BillingStatus, getBillingStatusLabel, HAND_TYPED_SETTLEMENT_ARCHIVED } from '@/lib/billing-enums';
import { parisDate, parisDateTimeDisplay } from '@/lib/paris-day';

export interface BillEventDTO {
    id: number;
    type: string;
    fromState: BillingStatus | null;
    toState: BillingStatus | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
    performedBy: { id: number; name: string | null } | null;
}

export const TYPE_LABEL: Record<string, string> = {
    CREATED: 'Facture créée',
    ISSUED: 'Facture émise',
    REOPENED: 'Facture rouverte',
    PAID: 'Facture payée',
    SETTLED: 'Facture soldée',
    AMOUNT_CHANGED: 'Montant recalculé',
    ORDER_ATTACHED: 'Demande ajoutée',
    ORDER_DETACHED: 'Demande retirée',
};

export const TYPE_TINT: Record<string, string> = {
    CREATED: 'bg-muted text-foreground',
    ISSUED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    REOPENED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
    PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    SETTLED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
    AMOUNT_CHANGED: 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200',
    ORDER_ATTACHED: 'bg-muted text-foreground',
    ORDER_DETACHED: 'bg-muted text-foreground',
};

/**
 * ORDER_ATTACHED covers two different things behind one BillEventType: an admin
 * manually picking a demande to attach to a bill, versus `accrueOrderToOpenDraft`
 * auto-attaching a demande the moment it reaches « Terminé » (see lib/billing.ts).
 * The latter is tagged `payload.reason === 'accrual'` — surface that as "closed",
 * not "added", since that's the act a reader (e.g. the stats audit trail) actually
 * cares about; the underlying event and bill total are unaffected either way.
 */
export function billEventLabel(type: string, payload: Record<string, unknown> | null): string {
    if (type === 'ORDER_ATTACHED' && payload?.reason === 'accrual') return 'Demande clôturée';
    // Même procédé : un PAID qui n'encaisse rien, il archive le règlement saisi à
    // la main avant la reprise (archiveHandTypedSettlement, lib/billing.ts).
    if (type === 'PAID' && payload?.reason === HAND_TYPED_SETTLEMENT_ARCHIVED) return 'Ancien règlement archivé';
    return TYPE_LABEL[type] ?? type;
}

export function billEventTint(type: string, payload: Record<string, unknown> | null): string {
    if (type === 'ORDER_ATTACHED' && payload?.reason === 'accrual') {
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200';
    }
    if (type === 'PAID' && payload?.reason === HAND_TYPED_SETTLEMENT_ARCHIVED) return 'bg-muted text-foreground';
    return TYPE_TINT[type] ?? 'bg-muted text-foreground';
}

const fmtDateTime = (iso: string) =>
    parisDateTimeDisplay(iso);

const fmtDate = (iso: unknown) =>
    typeof iso === 'string' ? parisDate(iso) : '—';

const asString = (v: unknown): string | null => (v == null ? null : String(v));

// Human-readable, one-line summary of an event's payload.
function summarize(e: BillEventDTO): string | null {
    const p = e.payload ?? {};
    switch (e.type) {
        case 'REOPENED': {
            const ref = asString(p.clearedPaymentReference);
            const date = asString(p.clearedPaymentDate);
            if (!ref && !date) return 'Aucune information de paiement à archiver.';
            const parts: string[] = [];
            if (ref) parts.push(`réf. de paiement précédente : ${ref}`);
            if (date) parts.push(`payée le ${fmtDate(date)}`);
            return `Informations archivées — ${parts.join(', ')}. Copiez-les si la réouverture était une erreur.`;
        }
        case 'AMOUNT_CHANGED': {
            const prev = asString(p.previousCost);
            const next = asString(p.newCost);
            const total = asString(p.newTotal);
            const bits: string[] = [];
            if (prev != null || next != null) bits.push(`coût demande #${asString(p.orderId) ?? '?'} : ${prev ?? '—'} € → ${next ?? '—'} €`);
            if (total != null) bits.push(`nouveau total : ${total} €`);
            return bits.join(' · ') || null;
        }
        case 'PAID': {
            if (p.reason === HAND_TYPED_SETTLEMENT_ARCHIVED) {
                const ref = asString(p.archivedPaymentReference);
                const date = asString(p.archivedPaymentDate);
                const parts: string[] = [];
                if (ref) parts.push(`réf. ${ref}`);
                if (date) parts.push(`payée le ${fmtDate(date)}`);
                return `Règlement saisi avant la reprise — ${parts.join(', ')}. Un paiement rattaché le remplace désormais sur la facture.`;
            }
            return asString(p.paymentReference) ? `Réf. de paiement : ${asString(p.paymentReference)}` : null;
        }
        case 'SETTLED': {
            // Le montant abandonné ne vit QUE là : `BillEvent` est append-only, et
            // la facture, elle, ne garde aucune trace de ce qu'on a renoncé à
            // percevoir. Les factures soldées d'avant ce payload n'en portent pas —
            // d'où le repli silencieux.
            const off = asString(p.writtenOff);
            const paid = asString(p.paidTotal);
            if (off == null) return null;
            return Number(off) > 0
                ? `Abandonné : ${off} €${paid != null && Number(paid) > 0 ? ` (encaissé ${paid} €)` : ''}`
                : 'Soldée sans rien abandonner — les paiements couvraient la facture.';
        }
        case 'ORDER_DETACHED':
            if (p.reason === 'bill-deleted') {
                const ids = Array.isArray(p.detachedPaymentIds) ? p.detachedPaymentIds.map(String) : [];
                return ids.length
                    ? `Facture supprimée — paiement${ids.length > 1 ? 's' : ''} n° ${ids.join(', ')} détaché${ids.length > 1 ? 's' : ''}, à retrouver dans « Paiements » (filtre « Sans facture liée »).`
                    : 'Facture supprimée — ses demandes en ont été détachées.';
            }
            return asString(p.orderId) ? `Demande #${asString(p.orderId)}` : null;
        case 'ORDER_ATTACHED':
            return asString(p.orderId) ? `Demande #${asString(p.orderId)}` : null;
        default:
            return null;
    }
}

export function BillHistory({ events }: { events: BillEventDTO[] }) {
    if (!events || events.length === 0) {
        return <p className="text-sm text-muted-foreground italic">Aucun événement enregistré.</p>;
    }

    return (
        <ol className="space-y-3">
            {events.map((e) => {
                const summary = summarize(e);
                const transition =
                    e.fromState && e.toState
                        ? `${getBillingStatusLabel(e.fromState)} → ${getBillingStatusLabel(e.toState)}`
                        : null;
                return (
                    <li key={e.id} className="flex gap-3 border-l-2 border-border pl-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-semibold rounded px-2 py-0.5 ${billEventTint(e.type, e.payload)}`}>
                                    {billEventLabel(e.type, e.payload)}
                                </span>
                                {transition && <span className="text-xs text-muted-foreground">{transition}</span>}
                            </div>
                            {summary && <p className="text-sm text-foreground mt-1 break-words">{summary}</p>}
                            <p className="text-xs text-muted-foreground mt-1">
                                {fmtDateTime(e.createdAt)}
                                {e.performedBy?.name ? ` · ${e.performedBy.name}` : ''}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}