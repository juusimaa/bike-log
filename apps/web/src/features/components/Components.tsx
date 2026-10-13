'use client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query';
import { useEffect, useState } from 'react';
import type {
    ComponentResponse,
    InstallationResponse,
    Position,
    PositionExemptionResponse,
    PositionStatusResponse,
    Validated,
} from '@bikelog/api-client';
import {
    useComponentPages,
    useInstallationPages,
    useComponentUsage,
    useExemptions,
} from './queries';
import { useOverview } from '../garage/queries';
import {
    useComponentCatalog,
    groupLabel,
    positionLabel,
    type Catalog,
    type CatalogEntry,
} from './catalog';
import { WheelSetup } from './WheelSetup';
import { ReadError } from '../../components/EmptyState';
import { formatDate } from '../../lib/dates';
import {
    formatGrams,
    formatKilograms,
    formatKilometres,
} from '../../lib/format';
type Installation = Validated<InstallationResponse>;
type Component = Validated<ComponentResponse>;
type Exemption = Validated<PositionExemptionResponse>;
type Status = Validated<PositionStatusResponse>;
/** Board actions that open a dialog owned by the workspace. */
export type BoardRequest =
    | {
          kind: 'remove' | 'move';
          installation: Installation;
          component: Component;
      }
    | {
          kind: 'exempt';
          position: Position;
          fitted?: { installation: Installation; component: Component };
      }
    | { kind: 'end-exemption'; exemption: Exemption };
function Lifetime({ componentId }: { componentId: string }) {
    const usage = useComponentUsage(componentId);
    return (
        <>
            {usage.data ? (
                <>
                    {formatKilometres(usage.data.combinedLifetimeMetres)} km{' '}
                    {usage.data.initialUsageEstimateMetres > 0 ? (
                        <small className="estimate-label">
                            Includes estimate
                        </small>
                    ) : (
                        <small>lifetime</small>
                    )}
                </>
            ) : usage.isError ? (
                <button
                    className="text-button"
                    onClick={() => void usage.refetch()}
                >
                    Retry usage
                </button>
            ) : (
                'Loading…'
            )}
        </>
    );
}
function plural(n: number, one: string, many = `${one}s`) {
    return `${n} ${n === 1 ? one : many}`;
}
function RowMenu({
    label,
    disabled,
    children,
}: {
    label: string;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <details className="row-menu">
            <summary
                className="more-button"
                aria-label={`More actions for ${label}`}
                aria-disabled={disabled || undefined}
                onClick={(e) => {
                    if (disabled) e.preventDefault();
                }}
            >
                <span aria-hidden="true">⋯</span>
            </summary>
            <div
                className="menu"
                onClick={(e) =>
                    ((
                        e.currentTarget.parentElement as HTMLDetailsElement
                    ).open = false)
                }
            >
                {children}
            </div>
        </details>
    );
}
export type ComponentsProps = {
    bikeId: string;
    disabled?: boolean;
    onPassport?: (componentId: string) => void;
    onReplace?: (installation: Validated<InstallationResponse>) => void;
    onFit?: (position: Position, exemption?: Exemption) => void;
    onRequest?: (request: BoardRequest) => void;
    onEditBike?: () => void;
};
export function Components({
    bikeId,
    disabled,
    onPassport,
    onReplace,
    onFit,
    onRequest,
    onEditBike,
}: ComponentsProps) {
    const client = useQueryClient();
    const [switching, setSwitching] = useState(false);
    const [status, setStatus] = useState<'current' | 'all'>('current');
    async function selectFilter(next: 'current' | 'all') {
        if (next === status || switching) return;
        setSwitching(true);
        const queryKey = queryKeys.installations(bikeId, next);
        await client.cancelQueries({ queryKey, exact: true });
        // Reset synchronously discards every page/cursor before mounting the next observer.
        void client.resetQueries({ queryKey, exact: true });
        setStatus(next);
        setSwitching(false);
    }
    const catalog = useComponentCatalog();
    const overview = useOverview(bikeId);
    const exemptions = useExemptions(bikeId);
    const chapters = useInstallationPages(bikeId, status);
    const current = useInstallationPages(bikeId, 'current');
    const collection = useComponentPages();
    const {
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    } = current;
    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError)
            void fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
    const currentRows = current.data?.pages.flatMap((p) => p.items) ?? [];
    const fitted = new Map(currentRows.map((r) => [r.installation.id, r]));
    const rows = [
        ...new Map(
            (chapters.data?.pages.flatMap((p) => p.items) ?? []).map((row) => [
                row.installation.id,
                row,
            ]),
        ).values(),
    ];
    const parts = [
        ...new Map(
            (collection.data?.pages.flatMap((p) => p.items) ?? []).map(
                (part) => [part.id, part],
            ),
        ).values(),
    ];
    const snapshot = overview.data;
    const statuses = snapshot?.positionStatuses ?? [];
    const openExemption = (position: string) =>
        exemptions.data?.find(
            (e) => e.position === position && e.endUtc === null,
        );
    const missing = statuses.filter((s) => s.state === 'missing');
    const weights = snapshot?.weights;
    const fittedCount = statuses.filter((s) => s.state === 'fitted').length;
    function row(entry: CatalogEntry, s: Status | undefined) {
        const label = entry.label.toLowerCase();
        const noneFittedMenu = entry.exemption === 'none-fitted' &&
            onRequest && (
                <RowMenu label={label} disabled={disabled}>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                            onRequest({
                                kind: 'exempt',
                                position: entry.position,
                            })
                        }
                    >
                        Mark none fitted…
                    </button>
                </RowMenu>
            );
        if (s?.state === 'fitted') {
            const identity = s.installationId
                ? fitted.get(s.installationId)
                : undefined;
            const c = identity?.component;
            return (
                <div className="pos-row state-fitted" key={entry.position}>
                    <span className="pos-label">{entry.label}</span>
                    <span className="part">
                        {c ? (
                            <button
                                type="button"
                                className="part-link"
                                disabled={disabled || !onPassport}
                                onClick={() => onPassport?.(c.id)}
                            >
                                {c.make}{' '}
                                {c.model?.trim() || 'Model not provided'}
                            </button>
                        ) : (
                            <strong>Loading part…</strong>
                        )}
                        {s.sinceUtc && (
                            <small>
                                On this bike since {formatDate(s.sinceUtc)}
                            </small>
                        )}
                    </span>
                    <span
                        className={`weight${c?.weightGrams == null ? ' unknown' : ''}`}
                    >
                        {c
                            ? c.weightGrams === null
                                ? 'No weight'
                                : formatGrams(c.weightGrams)
                            : ''}
                    </span>
                    <span className="km">
                        {s.componentId && (
                            <Lifetime componentId={s.componentId} />
                        )}
                    </span>
                    <span className="actions">
                        {identity && onReplace && (
                            <button
                                type="button"
                                className="text-button"
                                disabled={disabled}
                                aria-label={`Replace ${label}`}
                                onClick={() => onReplace(identity.installation)}
                            >
                                Replace
                            </button>
                        )}
                        {identity && (
                            <RowMenu label={label} disabled={disabled}>
                                {onRequest && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onRequest({
                                                    kind: 'move',
                                                    installation:
                                                        identity.installation,
                                                    component:
                                                        identity.component,
                                                })
                                            }
                                        >
                                            Move to another bike…
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onRequest({
                                                    kind: 'remove',
                                                    installation:
                                                        identity.installation,
                                                    component:
                                                        identity.component,
                                                })
                                            }
                                        >
                                            Remove from bike…
                                        </button>
                                        {entry.exemption && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onRequest({
                                                        kind: 'exempt',
                                                        position:
                                                            entry.position,
                                                        fitted: identity,
                                                    })
                                                }
                                            >
                                                {entry.exemption === 'tubeless'
                                                    ? 'Switch wheel to tubeless…'
                                                    : 'Mark none fitted…'}
                                            </button>
                                        )}
                                    </>
                                )}
                                <button
                                    type="button"
                                    disabled={!onPassport}
                                    onClick={() =>
                                        onPassport?.(identity.component.id)
                                    }
                                >
                                    History and details
                                </button>
                            </RowMenu>
                        )}
                    </span>
                </div>
            );
        }
        if (s?.state === 'exempt') {
            const exemption = openExemption(entry.position);
            const tubeless = s.reason === 'tubeless';
            return (
                <div className="pos-row state-empty" key={entry.position}>
                    <span className="pos-label">{entry.label}</span>
                    <span className="part">
                        <span className="pill quiet">
                            {tubeless
                                ? 'Not applicable (tubeless)'
                                : 'None fitted'}
                        </span>
                        {s.sinceUtc && (
                            <small>
                                Since {formatDate(s.sinceUtc)} · receives no
                                usage and shows no gaps
                            </small>
                        )}
                    </span>
                    <span className="weight unknown" />
                    <span className="km" />
                    <span className="actions">
                        {tubeless
                            ? exemption &&
                              onRequest && (
                                  <button
                                      type="button"
                                      className="text-button keep"
                                      disabled={disabled}
                                      onClick={() =>
                                          onRequest({
                                              kind: 'end-exemption',
                                              exemption,
                                          })
                                      }
                                  >
                                      Switch to tubed
                                  </button>
                              )
                            : onFit && (
                                  <button
                                      type="button"
                                      className="text-button keep"
                                      disabled={disabled || !exemption}
                                      aria-label={`Fit ${label}`}
                                      onClick={() =>
                                          onFit(entry.position, exemption)
                                      }
                                  >
                                      Fit one
                                  </button>
                              )}
                    </span>
                </div>
            );
        }
        if (s?.state === 'missing') {
            return (
                <div className="pos-row state-missing" key={entry.position}>
                    <span className="pos-label">{entry.label}</span>
                    <span className="part">
                        <span className="pill missing">
                            Missing since{' '}
                            {s.sinceUtc ? formatDate(s.sinceUtc) : '—'}
                        </span>
                        <small>
                            Rides from that date show a gap for this part
                        </small>
                    </span>
                    <span className="weight unknown" />
                    <span className="km" />
                    <span className="actions">
                        {onFit && (
                            <button
                                type="button"
                                className="button small primary keep"
                                disabled={disabled}
                                aria-label={`Fit ${label}`}
                                onClick={() => onFit(entry.position)}
                            >
                                Fit part
                            </button>
                        )}
                        {noneFittedMenu}
                    </span>
                </div>
            );
        }
        return (
            <div className="pos-row state-empty" key={entry.position}>
                <span className="pos-label">{entry.label}</span>
                <span className="part">
                    <span className="pill quiet">Not recorded</span>
                </span>
                <span className="weight unknown" />
                <span className="km" />
                <span className="actions">
                    {onFit && (
                        <button
                            type="button"
                            className="text-button keep"
                            disabled={disabled}
                            aria-label={`Fit ${label}`}
                            onClick={() => onFit(entry.position)}
                        >
                            <span aria-hidden="true">＋</span>Fit
                        </button>
                    )}
                    {noneFittedMenu}
                </span>
            </div>
        );
    }
    function board(c: Catalog) {
        return c.groups.map((group) => {
            const entries = c.positions.filter((p) => p.group === group);
            const stateOf = (p: CatalogEntry) =>
                statuses.find((s) => s.position === p.position);
            const main = entries.filter(
                (p) => stateOf(p)?.state !== 'not-recorded',
            );
            const quiet = entries.filter(
                (p) => stateOf(p)?.state === 'not-recorded',
            );
            const subtotal = weights?.groups.find((g) => g.group === group);
            const showWheels =
                group ===
                entries.find((p) => p.exemption === 'tubeless')?.group;
            return (
                <section
                    className="group"
                    key={group}
                    aria-labelledby={`group-${group}`}
                >
                    <div className="group-head">
                        <h2 id={`group-${group}`}>{groupLabel(group)}</h2>
                        {subtotal && (
                            <span className="subtotal tabular">
                                {formatKilograms(subtotal.grams)}
                                {subtotal.missingCount > 0 && (
                                    <small>
                                        {plural(subtotal.missingCount, 'part')}{' '}
                                        without weight
                                    </small>
                                )}
                            </span>
                        )}
                    </div>
                    {showWheels && onRequest && exemptions.data && (
                        <WheelSetup
                            catalog={c}
                            statuses={statuses}
                            exemptions={exemptions.data}
                            disabled={disabled}
                            onTubeless={(position) => {
                                const s = statuses.find(
                                    (x) => x.position === position,
                                );
                                const identity = s?.installationId
                                    ? fitted.get(s.installationId)
                                    : undefined;
                                onRequest({
                                    kind: 'exempt',
                                    position,
                                    fitted: identity,
                                });
                            }}
                            onTubed={(exemption) =>
                                onRequest({ kind: 'end-exemption', exemption })
                            }
                        />
                    )}
                    {main.map((p) => row(p, stateOf(p)))}
                    {quiet.length > 0 && (
                        <details className="unrecorded">
                            <summary>
                                <span>
                                    <strong>{quiet.length} not recorded</strong>{' '}
                                    ·{' '}
                                    {quiet
                                        .map((p) => p.label.toLowerCase())
                                        .join(', ')}
                                </span>
                            </summary>
                            {quiet.map((p) => row(p, stateOf(p)))}
                        </details>
                    )}
                </section>
            );
        });
    }
    return (
        <div className="position-board">
            {missing.length > 0 && catalog.data && (
                <div className="notice" role="status">
                    <p>
                        This bike is incomplete:{' '}
                        {missing.map((s, i) => (
                            <span key={s.position}>
                                {i > 0 && ', '}
                                <strong>
                                    {positionLabel(
                                        catalog.data,
                                        s.position,
                                    ).toLowerCase()}
                                </strong>{' '}
                                missing since{' '}
                                {s.sinceUtc ? formatDate(s.sinceUtc) : '—'}
                            </span>
                        ))}
                        . Rides can still be logged; they will show a gap for
                        the missing {missing.length === 1 ? 'part' : 'parts'}.
                    </p>
                    {onFit && (
                        <div className="notice-actions">
                            <button
                                type="button"
                                className="button small secondary"
                                disabled={disabled}
                                onClick={() => onFit(missing[0].position)}
                            >
                                Fit{' '}
                                {positionLabel(
                                    catalog.data,
                                    missing[0].position,
                                ).toLowerCase()}
                            </button>
                        </div>
                    )}
                </div>
            )}
            {weights && (
                <div className="board-summary">
                    <div className="metric">
                        <span>Bike weight</span>
                        <strong>{formatKilograms(weights.totalGrams)}</strong>
                        <small>
                            {weights.frameGrams === null
                                ? 'Frame weight not recorded'
                                : `Frame ${formatKilograms(weights.frameGrams)}`}{' '}
                            + {plural(fittedCount, 'part')}
                        </small>
                    </div>
                    <div className="metric">
                        <span>Weights recorded</span>
                        <strong>
                            {weights.missingCount
                                ? `${weights.missingCount} missing`
                                : 'All'}
                        </strong>
                        <small>
                            {weights.missingCount
                                ? 'Total counts recorded weights only'
                                : 'Total is complete'}
                        </small>
                    </div>
                    <p className="summary-note">
                        Integrated shift and brake levers recorded in both
                        positions count twice.
                    </p>
                    {weights.frameGrams === null && onEditBike && (
                        <div className="summary-actions">
                            <button
                                type="button"
                                className="button small secondary"
                                disabled={disabled}
                                onClick={onEditBike}
                            >
                                Add frame weight
                            </button>
                        </div>
                    )}
                </div>
            )}
            {(catalog.error || overview.error) && (
                <ReadError
                    error={(catalog.error ?? overview.error)!}
                    onRetry={() => {
                        void catalog.refetch();
                        void overview.refetch();
                    }}
                />
            )}
            {catalog.data && snapshot
                ? board(catalog.data)
                : !catalog.error &&
                  !overview.error && <p role="status">Loading parts…</p>}
            <section className="card table-card component-card">
                <div className="card-title">
                    <h2>Installation history</h2>
                </div>
                <div className="section-intro">
                    <p>
                        Lifetime mileage stays with the component.
                        <br />
                        Open a component to see calculated usage and
                        installation history.
                    </p>
                    <select
                        className="filter"
                        aria-label="Filter components"
                        value={status}
                        disabled={switching}
                        onChange={(e) =>
                            void selectFilter(
                                e.target.value as 'current' | 'all',
                            )
                        }
                    >
                        <option value="current">Currently fitted</option>
                        <option value="all">Include replaced parts</option>
                    </select>
                </div>
                {chapters.isPending && <p>Loading installations…</p>}
                {chapters.isError && (
                    <p role="alert">
                        Unable to load installations.{' '}
                        <button onClick={() => void chapters.refetch()}>
                            Retry installations
                        </button>
                    </p>
                )}
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Component</th>
                                <th>Lifetime</th>
                                <th>Status</th>
                                <th>
                                    <span className="visually-hidden">
                                        Actions
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ installation: i, component: c }) => {
                                const isCurrent = currentRows.some(
                                    (r) => r.installation.id === i.id,
                                );
                                const label = positionLabel(
                                    catalog.data,
                                    i.position,
                                );
                                return (
                                    <tr key={i.id}>
                                        <td>
                                            <div className="item-name">
                                                <span>
                                                    <strong className="position-label">
                                                        {label}
                                                    </strong>
                                                    <button
                                                        className="text-button component-name"
                                                        disabled={disabled}
                                                        onClick={() =>
                                                            onPassport?.(c.id)
                                                        }
                                                    >
                                                        {c.make}{' '}
                                                        {c.model?.trim() ||
                                                            'Model not provided'}
                                                    </button>
                                                </span>
                                            </div>
                                        </td>
                                        <td className="number">
                                            <Lifetime componentId={c.id} />
                                        </td>
                                        <td>
                                            <span
                                                className={`status ${isCurrent ? 'green' : 'gray'}`}
                                            >
                                                {isCurrent
                                                    ? 'Fitted'
                                                    : 'Archived'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="component-actions">
                                                <button
                                                    className="row-button"
                                                    disabled={
                                                        disabled || !onPassport
                                                    }
                                                    onClick={() =>
                                                        onPassport?.(c.id)
                                                    }
                                                    aria-label={`View ${label.toLowerCase()} history`}
                                                >
                                                    ↗
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {chapters.hasNextPage && (
                    <button
                        disabled={chapters.isFetchingNextPage}
                        onClick={() => void chapters.fetchNextPage()}
                    >
                        Load more installations
                    </button>
                )}
                <details className="component-library">
                    <summary>Other parts in your garage</summary>
                    <p>
                        Not fitted to any bike. Their history and usage stay
                        with them; fit one when fitting or replacing a part.
                    </p>
                    {collection.isError && (
                        <button onClick={() => void collection.refetch()}>
                            Retry collection
                        </button>
                    )}
                    {parts
                        .filter(
                            (c) =>
                                !rows.some((row) => row.component.id === c.id),
                        )
                        .map((c) => (
                            <article key={c.id}>
                                <button
                                    disabled={disabled}
                                    onClick={() => onPassport?.(c.id)}
                                >
                                    {c.make}{' '}
                                    {c.model?.trim() || 'Model not provided'}
                                </button>
                                {c.weightGrams !== null && (
                                    <span> {formatGrams(c.weightGrams)}</span>
                                )}
                                {c.installations.length === 0 && (
                                    <span> Never fitted</span>
                                )}
                            </article>
                        ))}
                    {collection.hasNextPage && (
                        <button
                            disabled={collection.isFetchingNextPage}
                            onClick={() => void collection.fetchNextPage()}
                        >
                            Load more components
                        </button>
                    )}
                </details>
            </section>
        </div>
    );
}
