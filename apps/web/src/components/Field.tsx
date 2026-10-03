'use client';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
type ControlProps = {
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean | 'true' | 'false';
};
export type FieldProps = {
    id: string;
    label: string;
    hint?: ReactNode;
    error?: string;
    children: ReactElement<ControlProps>;
};
export function Field({ id, label, hint, error, children }: FieldProps) {
    const description =
        [
            children.props['aria-describedby'],
            hint ? `${id}-hint` : '',
            error ? `${id}-error` : '',
        ]
            .filter(Boolean)
            .join(' ') || undefined;
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            {cloneElement(children, {
                id,
                'aria-describedby': description,
                'aria-invalid': error ? true : undefined,
            })}
            {hint && (
                <div className="field-hint" id={`${id}-hint`}>
                    {hint}
                </div>
            )}
            {error && (
                <div className="field-error" id={`${id}-error`}>
                    {error}
                </div>
            )}
        </div>
    );
}
