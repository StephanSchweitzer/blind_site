import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    type PagePricingForm,
    livePageCost,
    describePageCost,
} from '@/lib/orders/pagePricingForm';

// Entier pendant la saisie : que des chiffres.
const digits = (v: string) => v.replace(/[^0-9]/g, '');

// Montant pendant la saisie : chiffres et un seul séparateur décimal — la même
// règle que le champ « Coût » de OrderFormBackendBase, dupliquée ici parce que ce
// composant y est importé (un import inverse ferait un cycle).
const decimal = (v: string) => {
    const raw = (v ?? '').replace(/[^0-9.,]/g, '').replace(',', '.');
    const parts = raw.split('.');
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
};

const pad2 = (v: string) => {
    if (v.trim() === '') return '';
    const n = parseFloat(v.replace(',', '.'));
    return Number.isNaN(n) ? '' : n.toFixed(2);
};

/**
 * La tarification à la page d'une demande : la case, les quatre champs et le
 * total calculé. Sert au formulaire de modification et, en compact, à chaque
 * ligne du formulaire de création.
 *
 * Le total affiché est le même calcul que celui du serveur (pageCostEuros) : il
 * est là pour être vérifié avant l'envoi, pas pour être saisi.
 */
export function PagePricingFields({
    value,
    onChange,
    toggleDisabledReason,
    fieldsDisabledReason,
    compact = false,
}: {
    value: PagePricingForm;
    onChange: (next: PagePricingForm) => void;
    /** Si renseignée, la case est grisée et ce texte dit pourquoi. */
    toggleDisabledReason?: string | null;
    /** Si renseignée, les champs sont grisés et ce texte dit pourquoi. */
    fieldsDisabledReason?: string | null;
    compact?: boolean;
}) {
    const toggleId = React.useId();
    const set = (patch: Partial<PagePricingForm>) => onChange({ ...value, ...patch });
    const cost = livePageCost(value);
    const detail = describePageCost(value);
    const inputClass = `bg-card border-border text-foreground ${compact ? 'h-9' : ''} ${fieldsDisabledReason ? 'opacity-50 cursor-not-allowed' : ''}`;
    const labelClass = compact ? 'text-xs text-muted-foreground' : 'text-sm font-medium text-foreground';

    return (
        <div className="space-y-3">
            <div className="flex items-start gap-3">
                <Checkbox
                    id={toggleId}
                    checked={value.pageBased}
                    disabled={!!toggleDisabledReason}
                    onCheckedChange={(checked) => set({ pageBased: checked === true })}
                    className="mt-0.5"
                />
                <div className="space-y-0.5">
                    <label htmlFor={toggleId} className="text-sm font-medium text-foreground cursor-pointer">
                        Tarifer à la page (facture pro-forma)
                    </label>
                    <p className="text-xs text-muted-foreground">
                        {toggleDisabledReason
                            ? toggleDisabledReason
                            : 'Cette demande aura sa propre facture pro-forma, émise d’office quand elle passe « Terminé ».'}
                    </p>
                </div>
            </div>

            {value.pageBased && (
                <div className="space-y-3 rounded-md border border-border bg-card/50 p-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className={labelClass}>Pages lues <span className="text-red-500">*</span></label>
                            <Input
                                type="text"
                                inputMode="numeric"
                                value={value.pages}
                                onChange={(e) => set({ pages: digits(e.target.value) })}
                                disabled={!!fieldsDisabledReason}
                                className={inputClass}
                                placeholder="ex. 42"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className={labelClass}>Pages comptées (si différent)</label>
                            <Input
                                type="text"
                                inputMode="numeric"
                                value={value.billedPages}
                                onChange={(e) => set({ billedPages: digits(e.target.value) })}
                                disabled={!!fieldsDisabledReason}
                                className={inputClass}
                                placeholder={value.pages || 'comme les pages lues'}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className={labelClass}>Prix par page</label>
                            <div className="relative">
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={value.pricePerPage}
                                    onChange={(e) => set({ pricePerPage: decimal(e.target.value) })}
                                    onBlur={() => set({ pricePerPage: pad2(value.pricePerPage) })}
                                    disabled={!!fieldsDisabledReason}
                                    className={`${inputClass} pr-8`}
                                    placeholder="3.00"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">€</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className={labelClass}>Frais d&apos;envoi (WeTransfer)</label>
                            <div className="relative">
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={value.transferFee}
                                    onChange={(e) => set({ transferFee: decimal(e.target.value) })}
                                    onBlur={() => set({ transferFee: pad2(value.transferFee) })}
                                    disabled={!!fieldsDisabledReason}
                                    className={`${inputClass} pr-8`}
                                    placeholder="gratuit"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">€</span>
                            </div>
                        </div>
                    </div>

                    {fieldsDisabledReason && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">{fieldsDisabledReason}</p>
                    )}

                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-2">
                        <span className="text-xs text-muted-foreground">
                            {detail ?? 'Le total apparaît dès que le nombre de pages est renseigné.'}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                            Coût : {cost == null ? '—' : `${cost.toFixed(2).replace('.', ',')} €`}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
