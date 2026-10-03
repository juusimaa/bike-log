'use client';
import { Dialog } from './Dialog';
/** Render with dirty=true when a dirty form receives a pending cancel/navigation request. */
export function DirtyFormGuard({
    dirty,
    onDiscard,
    onStay,
}: {
    dirty: boolean;
    onDiscard: () => void;
    onStay: () => void;
}) {
    return (
        <Dialog open={dirty} title="Discard unsaved changes?" onCancel={onStay}>
            <p>Your changes have not been saved.</p>
            <button type="button" onClick={onStay} autoFocus>
                Keep editing
            </button>
            <button type="button" onClick={onDiscard}>
                Discard changes
            </button>
        </Dialog>
    );
}
