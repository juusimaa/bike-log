import { createApiClient } from '@bikelog/api-client';
export const api = createApiClient(
    typeof window === 'undefined'
        ? 'http://127.0.0.1:3000'
        : window.location.origin,
);
export function getApi() {
    return api;
}
