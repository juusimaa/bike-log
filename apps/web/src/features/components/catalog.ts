import { useQuery } from '@tanstack/react-query';
import type {
    ComponentCatalogResponse,
    Position,
    Validated,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
export type Catalog = Validated<ComponentCatalogResponse>;
export type CatalogEntry = Catalog['positions'][number];
/** The API owns positions, types, groups and labels; render whatever it returns (D13). */
export function useComponentCatalog() {
    return useQuery({
        queryKey: queryKeys.catalog(),
        queryFn: ({ signal }) => getApi().getComponentCatalog(signal),
        staleTime: Infinity,
    });
}
export function entryOf(
    catalog: Catalog | undefined,
    position: Position,
): CatalogEntry | undefined {
    return catalog?.positions.find((p) => p.position === position);
}
export function positionLabel(
    catalog: Catalog | undefined,
    position: Position,
): string {
    return entryOf(catalog, position)?.label ?? position.replaceAll('-', ' ');
}
/** "brake lever" for the front/rear brake lever positions, "saddle" for the saddle. */
export function typeLabel(catalog: Catalog | undefined, type: string): string {
    const entry = catalog?.positions.find((p) => p.type === type);
    if (!entry) return type.replaceAll('-', ' ');
    return (
        entry.end ? entry.label.split(' ').slice(1).join(' ') : entry.label
    ).toLowerCase();
}
export function capitalised(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
export function groupLabel(group: string): string {
    return capitalised(group.replaceAll('-', ' '));
}
export function oppositeOf(
    catalog: Catalog | undefined,
    entry: CatalogEntry,
): CatalogEntry | undefined {
    if (!entry.end) return undefined;
    return catalog?.positions.find(
        (p) => p.type === entry.type && p.end !== null && p.end !== entry.end,
    );
}
