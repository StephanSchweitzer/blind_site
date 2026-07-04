'use client';

import { createElement } from 'react';
import { ICON_KEYS, resolveIcon } from '@/lib/icons';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="bg-card border-border text-foreground">
                <div className="flex items-center gap-2">
                    {createElement(resolveIcon(value), { className: 'h-4 w-4' })}
                    <SelectValue placeholder="Icône" />
                </div>
            </SelectTrigger>
            <SelectContent className="bg-card border-border max-h-72">
                {ICON_KEYS.map((key) => (
                    <SelectItem key={key} value={key} className="text-foreground">
                        <span className="flex items-center gap-2">
                            {createElement(resolveIcon(key), { className: 'h-4 w-4' })} {key}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}