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
    const ready = e.state === 'ready';
    const distance = e.distanceSinceBaselineMetres;
    const threshold = e.activeThresholdMetres;
    const progress =
        ready && distance !== null && threshold !== null && threshold > 0
            ? Math.min(100, (distance / threshold) * 100)
            : null;
    const status =
        e.state === 'disabled'
            ? 'Reminder disabled'
            : e.state === 'no-current-chain'
              ? 'No fitted chain'
              : ready && e.due === true
                ? 'Lubrication due'
                : ready && e.due === false && e.remainingMetres !== null
                  ? `Ready · ${formatKilometres(e.remainingMetres)} km remaining`
                  : 'Reminder evaluation unavailable';
    return (
        <aside
            className="card service-card"
            aria-label="Chain lubrication reminder"
        >
            <div className="card-title">
                <h2>A little attention</h2>
                <span className="count">
                    {ready
                        ? e.due
                            ? '1 reminder'
                            : 'Up to date'
                        : 'Chain care'}
                </span>
            </div>
            <div className="service-header">
                <span className="service-symbol" aria-hidden="true">
                    ⌁
                </span>
                <div>
                    <h3>Lubricate your chain</h3>
                    {e.method && (
                        <small>
                            {e.method === 'wax' ? 'Wax' : 'Oil'} lubrication
                        </small>
                    )}
                </div>
            </div>
            <span
                className={`status ${ready ? (e.due ? 'amber' : 'green') : 'gray'}`}
            >
                {status}
            </span>
            {progress !== null && (
                <>
                    <div
                        className="progress"
                        role="progressbar"
                        aria-label="Chain lubrication interval"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="progress-labels">
                        <span>
                            {formatKilometres(distance!)} km since{' '}
                            {e.baselineKind === 'installation'
                                ? 'installation'
                                : 'service'}
                        </span>
                        <span>{formatKilometres(threshold!)} km</span>
                    </div>
                </>
            )}
            <button
                className="button secondary"
                disabled={disabled || e.componentId === null}
                onClick={onLubricate}
            >
                Log lubrication <span aria-hidden="true">↗</span>
            </button>
            <p className="service-footnote">
                Reminders follow your chosen interval.
                <br />
                Distance service prompt, not a wear measurement.
            </p>
            <button
                className="text-button reminder-settings"
                disabled={disabled}
                onClick={onConfigure}
            >
                Configure reminder
            </button>
        </aside>
    );
}
