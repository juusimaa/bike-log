import type { BikeResponse, Validated, Uuid } from '@bikelog/api-client';
import { BikeArt } from './BikeArt';
export function BikeSelector({
    bikes,
    onCreate,
    bikeId,
    onSelect,
    hasMore,
    loading,
    onLoadMore,
    disabled = false,
}: {
    onCreate?: () => void;
    bikes: Validated<BikeResponse>[];
    bikeId: Uuid | null;
    onSelect: (id: Uuid) => void;
    hasMore: boolean;
    loading: boolean;
    onLoadMore: () => void;
    disabled?: boolean;
}) {
    return (
        <div className="bike-selector" role="group" aria-label="Garage bikes">
            {bikes.map((b) => (
                <button
                    key={b.id}
                    disabled={disabled}
                    className={`bike-choice ${b.id === bikeId ? 'active' : ''}`}
                    aria-pressed={b.id === bikeId}
                    onClick={() => onSelect(b.id)}
                >
                    <BikeArt color={b.color} />
                    <span>
                        <strong>{b.displayName}</strong>
                        <small>
                            {[
                                [b.make, b.model].filter(Boolean).join(' '),
                                b.kind,
                                b.year,
                            ]
                                .filter(Boolean)
                                .join(' · ') || 'Metadata not provided'}
                        </small>
                    </span>
                    {b.id === bikeId && <span className="choice-dot" />}
                </button>
            ))}
            {onCreate && (
                <button
                    className="text-button create-bike"
                    disabled={disabled}
                    onClick={onCreate}
                >
                    <span aria-hidden="true">＋</span> Create bike
                </button>
            )}
            {hasMore && (
                <button
                    className="button secondary"
                    disabled={loading || disabled}
                    onClick={onLoadMore}
                >
                    {loading ? 'Loading…' : 'Load more bikes'}
                </button>
            )}
        </div>
    );
}
