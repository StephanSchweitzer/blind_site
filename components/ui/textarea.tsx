// components/ui/textarea.tsx
import React from 'react';

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => {
    return (
        <textarea
            className={`shadow-sm focus:ring-primary focus:border-primary block w-full sm:text-sm border-gray-300 rounded-md ${className}`}
            {...props}
        />
    );
};
