'use client';
import type {
    PositionExemptionResponse,
    PositionStatusResponse,
    Validated,
} from '@bikelog/api-client';
import { formatDate } from '../../lib/dates';
import { capitalised, type Catalog } from './catalog';
type Exemption = Validated<PositionExemptionResponse>;
type Status = Validated<PositionStatusResponse>;
/**
 * Per-wheel tube setup. A tubeless wheel is an intentionally empty inner tube position; the
 * wheels shown are the catalog's tubeless-capable positions.
 */
export function WheelSetup({
    catalog,
    statuses,
    exemptions,
    disabled,
    onTubeless,
    onTubed,
}: {
    catalog: Catalog;
    statuses: Status[];
    exemptions: Exemption[];
    disabled?: boolean;
    onTubeless: (position: string) => void;
    onTubed: (exemption: Exemption) => void;
}) {
    const wheels = catalog.positions.filter((p) => p.exemption === 'tubeless');
    if (!wheels.length) return null;
    const wheelName = (end: string | null) =>
        `${capitalised(end ?? '')} wheel`.trim();
    const history = exemptions
        .filter((e) => e.reason === 'tubeless')
        .sort((a, b) => b.startUtc.localeCompare(a.startUtc));
    return (
        <div className="wheel-setup" role="group" aria-label="Wheel setup">
            {wheels.map((w) => {
                const status = statuses.find((s) => s.position === w.position);
                const open = exemptions.find(
                    (e) => e.position === w.position && e.endUtc === null,
                );
                const tubeless = status?.state === 'exempt' && !!open;
                const since = status?.sinceUtc
                    ? formatDate(status.sinceUtc)
                    : null;
                return (
                    <div className="wheel-card" key={w.position}>
                        <div>
                            <strong>
                                {wheelName(w.end)}:{' '}
                                {tubeless ? 'tubeless' : 'tubed'}
                            </strong>
                            <small>
                                {tubeless
                                    ? `Since ${since}`
                                    : status?.state === 'fitted'
                                      ? `Tube fitted since ${since}`
                                      : status?.state === 'missing'
                                        ? `Tube missing since ${since}`
                                        : 'No tube recorded'}
                            </small>
                        </div>
                        <button
                            type="button"
                            className="text-button"
                            disabled={disabled}
                            onClick={() =>
                                tubeless && open
                                    ? onTubed(open)
                                    : onTubeless(w.position)
                            }
                        >
                            Switch {wheelName(w.end).toLowerCase()} to{' '}
                            {tubeless ? 'tubed' : 'tubeless'}
                        </button>
                    </div>
                );
            })}
            {history.length > 0 && (
                <details className="wheel-history">
                    <summary>Tubeless history</summary>
                    <ol>
                        {history.map((e) => (
                            <li key={e.id}>
                                {wheelName(
                                    catalog.positions.find(
                                        (p) => p.position === e.position,
                                    )?.end ?? null,
                                )}{' '}
                                tubeless {formatDate(e.startUtc)} –{' '}
                                {e.endUtc ? formatDate(e.endUtc) : 'now'}
                            </li>
                        ))}
                    </ol>
                </details>
            )}
        </div>
    );
}
