// components/ui/checkbox.tsx
import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Checkbox: React.FC<CheckboxProps> = ({ className, ...props }) => {
    return (
        <input
            type="checkbox"
            className={`h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded ${className}`}
            {...props}
        />
    );
};
