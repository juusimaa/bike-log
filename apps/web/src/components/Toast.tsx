/** Keep mounted so screen readers announce subsequent save messages. */
export function Toast({ message }: { message: string | null }) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`toast${message ? ' visible' : ''}`}
        >
            {message}
        </div>
    );
}
