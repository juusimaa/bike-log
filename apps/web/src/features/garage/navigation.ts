import type { Uuid, View } from '@bikelog/api-client';
export function readSelection(search: URLSearchParams): {
    bikeId: Uuid | null;
    view: View;
} {
    const id = search.get('bike');
    const view = search.get('view');
    return {
        bikeId:
            id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
                ? id
                : null,
        view:
            view === 'components' || view === 'rides' || view === 'maintenance'
                ? view
                : 'overview',
    };
}
export function selectionUrl(bikeId: Uuid | null, view: View) {
    const p = new URLSearchParams();
    if (bikeId) p.set('bike', bikeId);
    p.set('view', view);
    return `/?${p}`;
}
