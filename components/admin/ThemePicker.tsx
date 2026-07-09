'use client';

import { THEME_KEYS } from '@/lib/color-themes';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const SWATCH: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    indigo: 'bg-indigo-500',
};

export function ThemePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="bg-card border-border text-foreground">
                <SelectValue placeholder="Couleur" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
                {THEME_KEYS.map((key) => (
                    <SelectItem key={key} value={key} className="text-foreground">
                        <span className="flex items-center gap-2">
                            <span className={`inline-block h-3 w-3 rounded-full ${SWATCH[key]}`} /> {key}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
