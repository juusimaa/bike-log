'use client';
import type { ReactNode } from 'react';
export function ConflictPanel({
    attempted,
    current,
    onReapply,
    onCancel,
}: {
    attempted: ReactNode;
    current: ReactNode;
    onReapply: () => void;
    onCancel: () => void;
}) {
    return (
        <section aria-label="Save conflict" className="conflict-panel">
            <h3>This record changed before your save.</h3>
            <h4>Your attempted changes</h4>
            {attempted}
            <h4>Current saved record</h4>
            {current}
            <p>Review the current record before reapplying your changes.</p>
            <button type="button" onClick={onReapply}>
                Reapply my changes
            </button>
            <button type="button" onClick={onCancel}>
                Cancel
            </button>
        </section>
    );
}
