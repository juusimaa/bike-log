import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useState } from 'react';
import { Dialog } from '../src/components/Dialog';
import { Field } from '../src/components/Field';
import { FormError } from '../src/components/FormError';
import { DirtyFormGuard } from '../src/components/DirtyFormGuard';
import { Toast } from '../src/components/Toast';
import { ConflictPanel } from '../src/components/ConflictPanel';
it('dialogRestoresFocus', async () => {
    function Harness() {
        const [open, setOpen] = useState(false);
        return (
            <>
                <button onClick={() => setOpen(true)}>Edit</button>
                <Dialog
                    open={open}
                    title="Edit bike"
                    onCancel={() => setOpen(false)}
                >
                    <button onClick={() => setOpen(false)}>Done</button>
                </Dialog>
            </>
        );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Edit' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit bike');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(trigger).toHaveFocus());
});
it('native cancel calls the form cancellation path', () => {
    function Harness() {
        const [open, setOpen] = useState(true);
        return (
            <Dialog open={open} title="Edit" onCancel={() => setOpen(false)}>
                Fields
            </Dialog>
        );
    }
    render(<Harness />);
    fireEvent(
        screen.getByRole('dialog'),
        new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('field connects label hint and error to its input', () => {
    render(
        <Field
            id="distance"
            label="Distance"
            hint="Kilometres"
            error="Too precise"
        >
            <input id="distance" />
        </Field>,
    );
    const input = screen.getByLabelText('Distance');
    expect(input).toHaveAccessibleDescription('Kilometres Too precise');
    expect(input).toHaveAttribute('aria-invalid', 'true');
});
it('form errors focus their summary', () => {
    render(<FormError errors={['Distance is required']} />);
    expect(screen.getByRole('alert')).toHaveFocus();
});
it('dirty guard retains the form until discard is chosen', () => {
    function Harness() {
        const [guard, setGuard] = useState(true);
        const [value, setValue] = useState('Unsaved');
        return (
            <>
                <input
                    aria-label="Name"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                />
                <DirtyFormGuard
                    dirty={guard}
                    onStay={() => setGuard(false)}
                    onDiscard={() => {
                        setValue('');
                        setGuard(false);
                    }}
                />
            </>
        );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved');
});
it('conflict panel shows both inputs and requires explicit reapply', () => {
    let applied = false;
    render(
        <ConflictPanel
            attempted={<span>My name</span>}
            current={<span>Other name</span>}
            onReapply={() => {
                applied = true;
            }}
            onCancel={() => {}}
        />,
    );
    expect(screen.getByText('My name')).toBeInTheDocument();
    expect(screen.getByText('Other name')).toBeInTheDocument();
    expect(applied).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reapply my changes' }));
    expect(applied).toBe(true);
});
it('save notification is announced without taking form focus', () => {
    render(
        <>
            <input aria-label="Name" />
            <Toast message="Bike saved" />
        </>,
    );
    const input = screen.getByLabelText('Name');
    input.focus();
    expect(screen.getByRole('status')).toHaveTextContent('Bike saved');
    expect(input).toHaveFocus();
});
it('real field and toast emit styled visible selectors', () => {
    render(
        <>
            <Field id="styled" label="Styled" hint="Hint">
                <input />
            </Field>
            <Toast message="Saved" />
        </>,
    );
    expect(screen.getByLabelText('Styled').parentElement).toHaveClass('field');
    expect(screen.getByRole('status')).toHaveClass('toast', 'visible');
});
it('unload protection exists only while dirty or pending and is removed on teardown', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useBeforeUnload } = await import('../src/lib/useBeforeUnload');
    const { rerender, unmount } = renderHook(
        ({ dirty, busy }) => useBeforeUnload(dirty || busy),
        { initialProps: { dirty: false, busy: false } },
    );
    const unload = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    rerender({ dirty: true, busy: false });
    expect(unload()).toBe(true);
    rerender({ dirty: false, busy: true });
    expect(unload()).toBe(true);
    rerender({ dirty: false, busy: false });
    expect(unload()).toBe(false);
    rerender({ dirty: true, busy: true });
    unmount();
    expect(unload()).toBe(false);
});
