'use client';
import { useEffect, useRef } from 'react';
export function FormError({ errors }: { errors: readonly string[] }) {
    const ref = useRef<HTMLDivElement>(null);
    const message = errors.join('\n');
    useEffect(() => {
        if (message) ref.current?.focus();
    }, [message]);
    if (!errors.length) return null;
    return (
        <div ref={ref} role="alert" tabIndex={-1} className="form-error">
            <p>Check the following before saving:</p>
            <ul>
                {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                ))}
            </ul>
        </div>
    );
}
