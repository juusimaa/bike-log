'use client';
import type { ReminderEvaluation, Validated } from '@bikelog/api-client';
import { formatKilometres } from '../../lib/format';
export function ReminderCard({
    evaluation: e,
    onConfigure,
    onLubricate,
    disabled = false,
}: {
    evaluation: Validated<ReminderEvaluation>;
    onConfigure: () => void;
    onLubricate: () => void;
    disabled?: boolean;
}) {
    return (
        <aside
            className="card service-card"
            aria-label="Chain lubrication reminder"
        >
            <div className="card-title">
                <h2>Chain lubrication</h2>
            </div>
            {e.state === 'disabled' ? (
                <p>Reminder disabled</p>
            ) : e.state === 'no-current-chain' ? (
                <p>No fitted chain</p>
            ) : e.state === 'ready' && e.due === true ? (
                <p>Lubrication due</p>
            ) : e.state === 'ready' &&
              e.due === false &&
              e.remainingMetres !== null ? (
                <p>
                    Ready · {formatKilometres(e.remainingMetres)} km remaining
                </p>
            ) : (
                <p>Reminder evaluation unavailable</p>
            )}
            {e.method && <p>Method: {e.method}</p>}
            {e.distanceSinceBaselineMetres !== null && (
                <p>
                    {formatKilometres(e.distanceSinceBaselineMetres)} km since
                    baseline
                </p>
            )}
            {e.activeThresholdMetres !== null && (
                <p>Interval: {formatKilometres(e.activeThresholdMetres)} km</p>
            )}
            <p className="service-footnote">
                Distance service prompt, not a wear measurement.
            </p>
            <button
                className="button secondary"
                disabled={disabled}
                onClick={onConfigure}
            >
                Configure reminder
            </button>
            <button
                className="button"
                disabled={disabled || e.componentId === null}
                onClick={onLubricate}
            >
                Log lubrication
            </button>
        </aside>
    );
}
