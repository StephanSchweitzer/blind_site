'use client';
import React from 'react';
import { BillingStatus, getBillingStatusLabel } from '@/lib/billing-enums';

export interface BillEventDTO {
    id: number;
    type: string;
    fromState: BillingStatus | null;
    toState: BillingStatus | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
    performedBy: { id: number; name: string | null } | null;
}

const TYPE_LABEL: Record<string, string> = {
    CREATED: 'Facture créée',
    ISSUED: 'Facture émise',
    REOPENED: 'Facture rouverte',
    PAID: 'Facture payée',
    SETTLED: 'Facture soldée',
    AMOUNT_CHANGED: 'Montant recalculé',
    ORDER_ATTACHED: 'Demande ajoutée',
    ORDER_DETACHED: 'Demande retirée',
};

const TYPE_TINT: Record<string, string> = {
    CREATED: 'bg-muted text-foreground',
    ISSUED: 'bg-amber-900/60 text-amber-200',
    REOPENED: 'bg-rose-900/60 text-rose-200',
    PAID: 'bg-emerald-900/60 text-emerald-200',
    SETTLED: 'bg-blue-900/60 text-blue-200',
    AMOUNT_CHANGED: 'bg-violet-900/60 text-violet-200',
    ORDER_ATTACHED: 'bg-muted text-foreground',
    ORDER_DETACHED: 'bg-muted text-foreground',
};

const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

const fmtDate = (iso: unknown) =>
    typeof iso === 'string' ? new Date(iso).toLocaleDateString('fr-FR') : '—';

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
        case 'PAID':
            return asString(p.paymentReference) ? `Réf. de paiement : ${asString(p.paymentReference)}` : null;
        case 'ORDER_ATTACHED':
        case 'ORDER_DETACHED':
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
                        <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-semibold rounded px-2 py-0.5 ${TYPE_TINT[e.type] ?? 'bg-muted text-foreground'}`}>
                                    {TYPE_LABEL[e.type] ?? e.type}
                                </span>
                                {transition && <span className="text-xs text-muted-foreground">{transition}</span>}
                            </div>
                            {summary && <p className="text-sm text-foreground mt-1">{summary}</p>}
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