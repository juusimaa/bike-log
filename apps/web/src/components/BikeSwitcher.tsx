'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { BikeResponse, Validated, Uuid } from '@bikelog/api-client';
import { BikeArt } from './BikeArt';
import { Icon } from './Icon';
type Bike = Validated<BikeResponse>;
const RECENT_KEY = 'bikelog:recent-bikes';
/** Recently viewed bike ids for this browser tab; storage may be unavailable. */
function readRecent(): Uuid[] {
    try {
        const stored = JSON.parse(
            window.sessionStorage.getItem(RECENT_KEY) ?? '[]',
        );
        return Array.isArray(stored)
            ? stored.filter((x): x is Uuid => typeof x === 'string')
            : [];
    } catch {
        return [];
    }
}
function writeRecent(ids: Uuid[]) {
    try {
        window.sessionStorage.setItem(RECENT_KEY, JSON.stringify(ids));
    } catch {
        // Recent bikes are a convenience; the switcher works without them.
    }
}
function plural(n: number, one: string, many = `${one}s`) {
    return `${n} ${n === 1 ? one : many}`;
}
function details(b: Bike) {
    return (
        [[b.make, b.model].filter(Boolean).join(' '), b.kind, b.year]
            .filter(Boolean)
            .join(' · ') || 'Metadata not provided'
    );
}
function MissingPill({ count }: { count: number }) {
    return (
        <span className="pill missing">
            <Icon name="alert" />
            {plural(count, 'part')} missing
        </span>
    );
}
/** One row for the current bike, whatever the size of the garage (V4). */
export function BikeSwitcher({
    bikes,
    current,
    bikeId,
    onSelect,
    onCreate,
    hasMore,
    loading,
    onLoadMore,
    disabled = false,
}: {
    bikes: Bike[];
    /** The selected bike, even when it is not on a loaded page. */
    current: Bike | undefined;
    bikeId: Uuid | null;
    onSelect: (id: Uuid) => void;
    onCreate?: () => void;
    hasMore: boolean;
    loading: boolean;
    onLoadMore: () => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<Uuid[]>(() =>
        typeof window === 'undefined' ? [] : readRecent(),
    );
    if (bikeId && recent[0] !== bikeId)
        setRecent(
            [bikeId, ...recent.filter((id) => id !== bikeId)].slice(0, 4),
        );
    useEffect(() => writeRecent(recent), [recent]);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const isOpen = open && !disabled;
    useEffect(() => {
        if (!isOpen) return;
        search.current?.focus();
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [isOpen]);
    function close(returnFocus: boolean) {
        setOpen(false);
        setQuery('');
        if (returnFocus) trigger.current?.focus();
    }
    function choose(id: Uuid) {
        close(true);
        if (id !== bikeId) onSelect(id);
    }
    const options = () =>
        Array.from(
            list.current?.querySelectorAll<HTMLButtonElement>(
                '.switch-option',
            ) ?? [],
        );
    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const all = options();
        const at = all.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            all[Math.min(at + 1, all.length - 1)]?.focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            (at <= 0 ? search.current : all[at - 1])?.focus();
        } else if (
            event.key === 'Enter' &&
            event.target === search.current &&
            all[0]
        ) {
            event.preventDefault();
            all[0].click();
        }
    }
    const byName = [...bikes].sort((x, y) =>
        x.displayName.localeCompare(y.displayName),
    );
    const needle = query.trim().toLowerCase();
    const matches = needle
        ? byName.filter((b) =>
              [b.displayName, b.make, b.model, b.kind, b.year]
                  .filter((part) => part !== null && part !== undefined)
                  .join(' ')
                  .toLowerCase()
                  .includes(needle),
          )
        : byName;
    const lookup = new Map(bikes.map((b) => [b.id, b]));
    const recentBikes = recent
        .filter((id) => id !== bikeId)
        .map((id) => lookup.get(id))
        .filter((b): b is Bike => !!b)
        .slice(0, 3);
    const incomplete = bikes.filter((b) => b.missingPositions.length).length;
    const total = `${bikes.length}${hasMore ? '+' : ''}`;
    const option = (b: Bike) => {
        const active = b.id === bikeId;
        return (
            <button
                key={b.id}
                type="button"
                className={`switch-option${active ? ' active' : ''}`}
                aria-current={active || undefined}
                onClick={() => choose(b.id)}
            >
                <BikeArt color={b.color} kind={b.kind} />
                <span className="switcher-text">
                    <strong>{b.displayName}</strong>
                    <small>{details(b)}</small>
                </span>
                <span className="option-meta">
                    {b.missingPositions.length > 0 && (
                        <MissingPill count={b.missingPositions.length} />
                    )}
                </span>
                <span className="option-check">
                    {active && <Icon name="check" />}
                </span>
            </button>
        );
    };
    if (!current && bikes.length === 0)
        return onCreate && !loading ? (
            <div className="bike-switcher">
                <button
                    type="button"
                    className="button secondary"
                    disabled={disabled}
                    onClick={onCreate}
                >
                    <Icon name="plus" />
                    Create bike
                </button>
            </div>
        ) : null;
    return (
        <div
            className="bike-switcher"
            ref={root}
            onBlur={(event) => {
                if (
                    isOpen &&
                    !event.currentTarget.contains(event.relatedTarget as Node)
                )
                    close(false);
            }}
        >
            <button
                ref={trigger}
                type="button"
                className="switcher-button"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={panelId}
                disabled={disabled}
                onClick={() => (isOpen ? close(false) : setOpen(true))}
            >
                <BikeArt color={current?.color} kind={current?.kind} />
                <span className="switcher-text">
                    <strong>{current?.displayName ?? 'Choose a bike'}</strong>
                    <small>
                        {current
                            ? details(current)
                            : `${plural(bikes.length, 'bike')} to choose from`}
                    </small>
                </span>
                {current && current.missingPositions.length > 0 && (
                    <MissingPill count={current.missingPositions.length} />
                )}
                <span className="switcher-change">
                    <span className="label">Change bike</span>
                    <Icon name="chevron" className="chev" />
                </span>
            </button>
            <p className="switcher-count">
                {total} {bikes.length === 1 && !hasMore ? 'bike' : 'bikes'} in
                your garage
                {incomplete > 0 && (
                    <>
                        {' · '}
                        <span className="amber">{incomplete} incomplete</span>
                    </>
                )}
            </p>
            {isOpen && (
                <div
                    id={panelId}
                    className="switcher-panel"
                    role="dialog"
                    aria-label="Choose a bike"
                    onKeyDown={onKeyDown}
                >
                    <label className="switcher-search">
                        <Icon name="search" />
                        <span className="visually-hidden">Search bikes</span>
                        <input
                            ref={search}
                            type="search"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={`Search ${total} bikes by name, make or model`}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </label>
                    <div className="switcher-list" ref={list}>
                        {needle ? (
                            matches.length ? (
                                <>
                                    <p className="list-heading" role="status">
                                        {plural(
                                            matches.length,
                                            'match',
                                            'matches',
                                        )}
                                        {hasMore &&
                                            ' in the bikes loaded so far'}
                                    </p>
                                    {matches.map(option)}
                                </>
                            ) : (
                                <p className="list-empty" role="status">
                                    No bike matches “{query.trim()}”. Try a
                                    make, model or year.
                                </p>
                            )
                        ) : (
                            <>
                                {recentBikes.length > 0 && (
                                    <>
                                        <p className="list-heading">
                                            Recently viewed
                                        </p>
                                        {recentBikes.map(option)}
                                    </>
                                )}
                                <p className="list-heading">
                                    All bikes · {total}
                                </p>
                                {byName.map(option)}
                            </>
                        )}
                        {hasMore && (
                            <button
                                type="button"
                                className="button small secondary load-more"
                                aria-disabled={loading || undefined}
                                onClick={() => {
                                    // Stays enabled so focus (and the panel) survives the fetch.
                                    if (!loading) onLoadMore();
                                }}
                            >
                                {loading ? 'Loading…' : 'Load more bikes'}
                            </button>
                        )}
                    </div>
                    <div className="switcher-foot">
                        {onCreate && (
                            <button
                                type="button"
                                className="text-button"
                                onClick={() => {
                                    // The dialog returns focus to the switcher, not a vanished panel.
                                    close(true);
                                    onCreate();
                                }}
                            >
                                <Icon name="plus" />
                                Create bike
                            </button>
                        )}
                        <span aria-hidden="true">
                            ↑ ↓ to move · Enter to choose · Esc to close
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
