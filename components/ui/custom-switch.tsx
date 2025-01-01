// components/ui/custom-switch.tsx
import React from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
                                                  checked,
                                                  onChange,
                                                  disabled = false,
                                                  id,
                                                  className = '',
                                              }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            id={id}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                checked ? 'bg-blue-600' : 'bg-gray-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
        >
            <span
                className={`${
                    checked ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition ease-in-out duration-200`}
            />
        </button>
    );
};