'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
export type DialogProps = {
    open: boolean;
    title: string;
    onCancel: () => void;
    children: ReactNode;
};
export function Dialog({ open, title, onCancel, children }: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => {
        const dialog = ref.current;
        if (!open || !dialog) return;
        const previous =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        dialog.showModal();
        return () => {
            dialog.close();
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);
    return (
        <dialog
            ref={ref}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                onCancel();
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Tab') return;
                const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                        'button, input, select, textarea, a[href], [tabindex]',
                    ),
                ).filter(
                    (element) =>
                        !element.matches(':disabled') &&
                        element.tabIndex >= 0 &&
                        element.getClientRects().length > 0,
                );
                const first = controls[0],
                    last = controls.at(-1);
                if (!first || !last) {
                    event.preventDefault();
                    event.currentTarget.focus();
                } else if (
                    event.shiftKey &&
                    (document.activeElement === first ||
                        !controls.includes(
                            document.activeElement as HTMLElement,
                        ))
                ) {
                    event.preventDefault();
                    last.focus();
                } else if (
                    !event.shiftKey &&
                    (document.activeElement === last ||
                        !controls.includes(
                            document.activeElement as HTMLElement,
                        ))
                ) {
                    event.preventDefault();
                    first.focus();
                }
            }}
            className="form-dialog"
        >
            <h2 id={titleId}>{title}</h2>
            {children}
        </dialog>
    );
}
