'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
export type DialogProps = {
    open: boolean;
    title: string;
    onCancel: () => void;
    children: ReactNode;
    /** Reading dialogs with figures and history (640px instead of 500px). */
    wide?: boolean;
    /** Context line under the title; stays visible while the body scrolls. */
    description?: ReactNode;
    /** Actions pinned below the scrolling body, for dialogs without a form. */
    footer?: ReactNode;
};
export function Dialog({
    open,
    title,
    onCancel,
    children,
    wide = false,
    description,
    footer,
}: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();
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
            aria-describedby={description ? descriptionId : undefined}
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
            className={wide ? 'form-dialog wide' : 'form-dialog'}
        >
            <header className="dialog-heading">
                <h2 id={titleId}>{title}</h2>
                {description && (
                    <p id={descriptionId} className="dialog-subtitle">
                        {description}
                    </p>
                )}
            </header>
            <div className="dialog-body">{children}</div>
            {footer && (
                <div className="dialog-actions dialog-footer">{footer}</div>
            )}
            {/* Last in DOM order so opening still focuses the first field; drawn top-right. */}
            <button
                type="button"
                className="icon-button dialog-close"
                aria-label="Close"
                onClick={onCancel}
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
            </button>
        </dialog>
    );
}
