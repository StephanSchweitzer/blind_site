import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface YearCommandSelectProps {
    value: string;
    onChange: (value: string) => void;
    startYear?: number;
    endYear?: number;
}

const YearCommandSelect: React.FC<YearCommandSelectProps> = ({
                                                                 value,
                                                                 onChange,
                                                                 startYear = 1900,
                                                                 endYear = new Date().getFullYear()
                                                             }) => {
    const [open, setOpen] = useState(false);
    const years = Array.from(
        { length: endYear - startYear + 1 },
        (_, i) => (endYear - i).toString()
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700"
                >
                    {value || "Sélectionner l'année..."}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700">
                <Command className="bg-gray-800">
                    <CommandInput
                        placeholder="Rechercher une année..."
                        className="border-none focus:ring-0 text-gray-100"
                    />
                    <CommandEmpty className="py-2 text-gray-400 text-center">
                        Aucune année trouvée.
                    </CommandEmpty>
                    <CommandGroup className="max-h-60 overflow-y-auto">
                        {years.map((year) => (
                            <CommandItem
                                key={year}
                                value={year}
                                onSelect={() => {
                                    onChange(year);
                                    setOpen(false);
                                }}
                                className="text-gray-100 hover:bg-gray-700 cursor-pointer"
                            >
                                {year}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    );
};

export default YearCommandSelect;