'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import type { SiteContact } from '@prisma/client';

interface ContactFormProps {
    initial: SiteContact | null;
}

export function ContactForm({ initial }: ContactFormProps) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const [formData, setFormData] = useState({
        orgName: initial?.orgName ?? '',
        orgSubtitle: initial?.orgSubtitle ?? '',
        addressLines: initial?.addressLines ?? '',
        phones: initial?.phones ?? '',
        email: initial?.email ?? '',
        hoursText: initial?.hoursText ?? '',
        metroText: initial?.metroText ?? '',
        busText: initial?.busText ?? '',
        visitText: initial?.visitText ?? '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        setSaved(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/site-contact', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Une erreur est survenue');
            }
            setSaved(true);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setSaving(false);
        }
    };

    const field = 'bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground';
    const labelCls = 'block text-sm font-medium text-foreground mb-2';

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto py-8">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border">
                        <CardTitle className="text-foreground">Coordonnées du site</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            Contenu affiché sur la page Contact. Une ligne par élément (adresse, téléphones, horaires…).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="orgName" className={labelCls}>Nom de l&apos;organisation *</label>
                                <Input id="orgName" name="orgName" required value={formData.orgName} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="orgSubtitle" className={labelCls}>Sous-titre</label>
                                <Input id="orgSubtitle" name="orgSubtitle" value={formData.orgSubtitle} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="addressLines" className={labelCls}>Adresse * (une ligne par ligne d&apos;adresse)</label>
                                <Textarea id="addressLines" name="addressLines" required value={formData.addressLines} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="phones" className={labelCls}>Téléphone(s) * (un par ligne)</label>
                                <Textarea id="phones" name="phones" required value={formData.phones} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="email" className={labelCls}>Email *</label>
                                <Input id="email" name="email" type="email" required value={formData.email} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="hoursText" className={labelCls}>Permanences * (un créneau par ligne)</label>
                                <Textarea id="hoursText" name="hoursText" required value={formData.hoursText} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="metroText" className={labelCls}>Métro (une ligne par station)</label>
                                <Textarea id="metroText" name="metroText" value={formData.metroText} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="busText" className={labelCls}>Autobus</label>
                                <Textarea id="busText" name="busText" value={formData.busText} onChange={handleChange} className={field} />
                            </div>
                            <div>
                                <label htmlFor="visitText" className={labelCls}>Texte « Venez nous rendre visite »</label>
                                <Textarea id="visitText" name="visitText" value={formData.visitText} onChange={handleChange} className={field} />
                            </div>

                            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                            {saved && <p className="text-sm text-green-600 dark:text-green-400">Enregistré.</p>}

                            <div className="flex justify-end pt-4">
                                <Button type="submit" disabled={saving} className="bg-muted text-foreground border-border hover:bg-muted">
                                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
