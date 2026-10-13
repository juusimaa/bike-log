'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { ConflictPanel } from '../../components/ConflictPanel';
import { useMutationRecovery } from '../../lib/mutation';
/** Thrown by a dialog's build step to attach a message to one field. */
export class FieldProblem extends Error {
    constructor(
        public field: string,
        message: string,
    ) {
        super(message);
    }
}
/** The API's explanation when it has one, otherwise the error's own message. */
export function problemText(error: unknown): string {
    if (error instanceof ApiError) {
        const detail = error.problem?.detail;
        return typeof detail === 'string' && detail ? detail : error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
/**
 * One versioned write behind a small form. A stale version shows the conflict panel with the
 * current record; reapplying uses the refreshed version and never guesses.
 */
export function ActionDialog<T, R>({
    title,
    submitLabel,
    build,
    send,
    refresh,
    rebase,
    describe,
    onSaved,
    onCancel,
    onBusyChange,
    onDirtyChange,
    dirty = false,
    setFieldErrors,
    children,
}: {
    title: string;
    submitLabel: string;
    build: () => T;
    send: (input: T) => Promise<R>;
    refresh: () => Promise<unknown>;
    rebase: (input: T, current: unknown) => T | null;
    describe: (current: unknown) => ReactNode;
    onSaved: (result: R) => void;
    onCancel: () => void;
    onBusyChange?: (busy: boolean) => void;
    onDirtyChange?: (dirty: boolean) => void;
    dirty?: boolean;
    /** Owned by the caller, which renders each field's message next to it. */
    fieldErrors: Record<string, string>;
    setFieldErrors: (errors: Record<string, string>) => void;
    children: ReactNode;
}) {
    const save = useMutationRecovery<T, R>(send);
    const [errors, setErrors] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
    useEffect(
        () => onDirtyChange?.(dirty || recovery),
        [dirty, recovery, onDirtyChange],
    );
    function finish(result: R | undefined) {
        if (result === undefined) return;
        onDirtyChange?.(false);
        onSaved(result);
    }
    async function submit() {
        setAttempt((n) => n + 1);
        setErrors([]);
        setFieldErrors({});
        let input: T;
        try {
            input = build();
        } catch (e) {
            if (e instanceof FieldProblem)
                setFieldErrors({ [e.field]: e.message });
            setErrors([problemText(e)]);
            return;
        }
        finish(await save.submit(input));
        if (save.getState().phase !== 'saved' && save.getState().error)
            setErrors([problemText(save.getState().error)]);
        if (save.getState().phase === 'conflict')
            await save.refreshCurrent(refresh);
    }
    async function retry() {
        const attempted = save.state.attempted;
        if (attempted === undefined || !save.state.refreshed) return;
        const input = rebase(attempted, save.state.current);
        if (input === null) return;
        setErrors([]);
        finish(
            await (save.state.phase === 'conflict'
                ? save.reapply(input)
                : save.resubmit(input)),
        );
        if (save.getState().error && save.getState().phase !== 'saved')
            setErrors([problemText(save.getState().error)]);
    }
    const current = save.state.refreshed ? save.state.current : undefined;
    const reapplicable =
        save.state.attempted !== undefined &&
        current !== undefined &&
        rebase(save.state.attempted, current) !== null;
    return (
        <Dialog
            open
            title={title}
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && !recovery) void submit();
                }}
            >
                <FormError key={attempt} errors={errors} />
                <fieldset disabled={busy || recovery}>{children}</fieldset>
                <div className="dialog-actions">
                    <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="button primary"
                        type="submit"
                        disabled={busy || recovery}
                    >
                        {submitLabel}
                    </button>
                </div>
            </form>
            {save.state.phase === 'conflict' && current !== undefined && (
                <ConflictPanel
                    attempted={<p>{submitLabel} with the date you entered.</p>}
                    current={
                        <>
                            {describe(current)}
                            {!reapplicable && (
                                <p>
                                    This change no longer applies to the current
                                    record.
                                </p>
                            )}
                        </>
                    }
                    onReapply={() => void retry()}
                    onCancel={onCancel}
                />
            )}
            {save.state.phase === 'conflict' && save.state.refreshError && (
                <p role="alert">
                    Unable to load the current record.{' '}
                    <button onClick={() => void save.refreshCurrent(refresh)}>
                        Retry
                    </button>
                </p>
            )}
            {save.state.phase === 'uncertain' && (
                <section>
                    <p>
                        The outcome is uncertain. Refresh to check what was
                        saved before resubmitting.
                    </p>
                    <button
                        disabled={busy}
                        onClick={() => void save.refreshCurrent(refresh)}
                    >
                        Refresh
                    </button>
                    {current !== undefined && (
                        <>
                            {describe(current)}
                            <button
                                disabled={busy || !reapplicable}
                                onClick={() => void retry()}
                            >
                                Resubmit after review
                            </button>
                        </>
                    )}
                </section>
            )}
        </Dialog>
    );
}
