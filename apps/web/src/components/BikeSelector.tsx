import type { BikeResponse, Validated, Uuid } from '@bikelog/api-client';
import { BikeArt } from './BikeArt';
export function BikeSelector({
    bikes,
    bikeId,
    onSelect,
    hasMore,
    loading,
    onLoadMore,
    disabled = false,
}: {
    bikes: Validated<BikeResponse>[];
    bikeId: Uuid | null;
    onSelect: (id: Uuid) => void;
    hasMore: boolean;
    loading: boolean;
    onLoadMore: () => void;
    disabled?: boolean;
}) {
    return (
        <div className="bike-selector" aria-label="Garage bikes">
            {bikes.map((b) => (
                <button
                    key={b.id}
                    disabled={disabled}
                    className={`bike-choice ${b.id === bikeId ? 'active' : ''}`}
                    aria-pressed={b.id === bikeId}
                    onClick={() => onSelect(b.id)}
                >
                    <BikeArt />
                    <span>
                        <strong>{b.displayName}</strong>
                        <small>
                            {[b.make, b.model, b.kind]
                                .filter(Boolean)
                                .join(' · ') || 'Metadata not provided'}
                        </small>
                    </span>
                </button>
            ))}
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
