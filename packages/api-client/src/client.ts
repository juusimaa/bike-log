import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';
import type * as Dto from './dto';
import type { Validated } from './dto';
import snapshot from '../openapi.json';
import { ClientRangeError, decodeJson, safeNumericToken } from './codec';

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public currentVersion?: number,
        public uncertain = false,
        public problem?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}
type Schema = {
    $ref?: string;
    type?: string | string[];
    format?: string;
    enum?: unknown[];
    required?: string[];
    properties?: Record<string, Schema>;
    items?: Schema;
};
const schemas = snapshot.components.schemas as Record<string, Schema>;
const nullableDates = new Set(['endUtc', 'calculatedAtUtc', 'baselineUtc']);
function invalid(): never {
    throw new ApiError(
        0,
        'invalid_response',
        'The API returned an unsupported response.',
    );
}
function validate(
    value: unknown,
    schema: Schema,
    key = '',
    input = false,
): unknown {
    if (schema.$ref)
        return validate(
            value,
            schemas[schema.$ref.split('/').at(-1)!],
            key,
            input,
        );
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (value === null) {
        if (
            types.includes('null') ||
            (schema.format === 'date-time' && nullableDates.has(key))
        )
            return null;
        return invalid();
    }
    if (['int32', 'int64', 'double'].includes(schema.format ?? '')) {
        if (typeof value !== 'number' && typeof value !== 'string')
            return invalid();
        if (typeof value === 'string' && !types.includes('string'))
            return invalid();
        const numeric = safeNumericToken(
            String(value),
            schema.format !== 'double',
        );
        if (
            schema.format === 'int32' &&
            (numeric < -2147483648 || numeric > 2147483647)
        )
            throw new ClientRangeError();
        return numeric;
    }
    if (schema.format === 'date-time') {
        if (typeof value !== 'string') return invalid();
        const match =
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(
                value,
            );
        if (!match) return invalid();
        const [
            ,
            yearText,
            monthText,
            dayText,
            hourText,
            minuteText,
            secondText,
            offset,
        ] = match;
        const year = Number(yearText),
            month = Number(monthText),
            day = Number(dayText);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [
            31,
            leap ? 29 : 28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ];
        if (
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > days[month - 1] ||
            Number(hourText) > 23 ||
            Number(minuteText) > 59 ||
            Number(secondText) > 59 ||
            (offset !== 'Z' &&
                (Number(offset.slice(1, 3)) > 23 ||
                    Number(offset.slice(4)) > 59))
        )
            return invalid();
        return value;
    }
    if (
        schema.format === 'uuid' &&
        (typeof value !== 'string' ||
            !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))
    )
        return invalid();
    if (schema.enum && !schema.enum.includes(value)) return invalid();
    if (types.includes('object') || schema.properties) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return invalid();
        const record = value as Record<string, unknown>;
        for (const name of schema.required ?? [])
            if (!(name in record) || record[name] === undefined)
                return invalid();
        const result: Record<string, unknown> = { ...record };
        for (const [name, child] of Object.entries(schema.properties ?? {}))
            if (record[name] !== undefined)
                result[name] = validate(record[name], child, name, input);
        return result;
    }
    if (types.includes('array')) {
        if (!Array.isArray(value)) return invalid();
        return value.map((v) => validate(v, schema.items!, key, input));
    }
    if (types.includes('integer')) {
        if (typeof value !== 'number') return invalid();
        return safeNumericToken(String(value), true);
    }
    if (types.includes('number')) {
        if (typeof value !== 'number') return invalid();
        return safeNumericToken(String(value));
    }
    if (types.includes('string') && typeof value !== 'string') return invalid();
    if (types.includes('boolean') && typeof value !== 'boolean')
        return invalid();
    return value;
}
type Method = 'get' | 'post' | 'put' | 'delete';
type Operation = {
    requestBody?: { content: Record<string, { schema: Schema }> };
    responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
};
const operations = snapshot.paths as unknown as Record<
    string,
    Partial<Record<Method, Operation>>
>;
type Options = {
    id?: string;
    query?: Record<string, unknown>;
    body?: unknown;
    signal?: AbortSignal;
};
export function createApiClient(
    baseUrl: string,
    fetchImpl: typeof fetch = fetch,
) {
    const base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(base.protocol))
        throw new Error('An absolute HTTP API base URL is required.');
    async function request<T>(
        method: Method,
        path: keyof paths,
        options: Options = {},
    ): Promise<Validated<T>> {
        const mutation = method !== 'get';
        let sent = false;
        try {
            if (
                options.id &&
                !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
                    options.id,
                )
            )
                throw new ApiError(
                    0,
                    'invalid_input',
                    'A valid ID is required.',
                );
            for (const value of Object.values(options.query ?? {}))
                if (typeof value === 'number')
                    safeNumericToken(String(value), true);
            const operation = operations[path]?.[method];
            if (!operation) throw new Error('Unknown API operation');
            const bodySchema =
                operation.requestBody?.content['application/json']?.schema;
            const body = bodySchema
                ? validate(options.body, bodySchema, '', true)
                : undefined;
            // Wrappers below constrain path/body/result types to generated DTOs. One
            // generic dispatch boundary is needed because the verb is selected here.
            sent = true;
            let errorText: string | undefined;
            const transport = createClient<paths>({
                baseUrl: baseUrl.replace(/\/$/, ''),
                redirect: 'error',
                cache: 'no-store',
                fetch: async (request) => {
                    const response = await fetchImpl(request);
                    if (response.ok) return response;
                    // openapi-fetch parses errors as JSON even with parseAs:'text'. Keep raw
                    // text and give it an empty error body so unsafe tokens never reach JSON.parse.
                    errorText = await response.text();
                    return new Response(null, {
                        status: response.status,
                        headers: response.headers,
                    });
                },
            });
            const result = await transport.request(
                method,
                path as never,
                {
                    params: { path: { id: options.id }, query: options.query },
                    body,
                    signal: options.signal,
                    parseAs: 'text',
                } as never,
            );
            const response = result.response;
            if (response.status === 204) {
                if (!operation.responses['204']) return invalid();
                return undefined as Validated<T>;
            }
            const contentType = response.headers.get('content-type') ?? '';
            if (
                !/^application\/(?:json|problem\+json)(?:;|$)/i.test(
                    contentType,
                )
            )
                return invalid();
            const text = (response.ok ? result.data : errorText) as unknown;
            if (typeof text !== 'string') return invalid();
            const decoded = decodeJson(text);
            if (!response.ok) {
                if (
                    !decoded ||
                    typeof decoded !== 'object' ||
                    Array.isArray(decoded)
                )
                    return invalid();
                const problem = decoded as Record<string, unknown>;
                const version =
                    problem.currentVersion === undefined
                        ? undefined
                        : safeNumericToken(
                              String(problem.currentVersion),
                              true,
                          );
                throw new ApiError(
                    response.status,
                    typeof problem.code === 'string'
                        ? problem.code
                        : 'api_error',
                    typeof problem.title === 'string'
                        ? problem.title
                        : 'The API request failed.',
                    version,
                    mutation && response.status >= 500,
                    problem,
                );
            }
            const responseSchema =
                operation.responses[String(response.status)]?.content?.[
                    'application/json'
                ]?.schema;
            if (!responseSchema) return invalid();
            return validate(decoded, responseSchema) as Validated<T>;
        } catch (error) {
            if (error instanceof ApiError) {
                if (!sent && error.code === 'invalid_response')
                    throw new ApiError(
                        0,
                        'invalid_input',
                        'The request contains unsupported input.',
                    );
                if (sent && mutation && error.status === 0)
                    error.uncertain = true;
                throw error;
            }
            if (error instanceof ClientRangeError)
                throw new ApiError(
                    0,
                    'client_range',
                    error.message,
                    undefined,
                    sent && mutation,
                );
            if (error instanceof SyntaxError)
                throw new ApiError(
                    0,
                    'invalid_response',
                    'The API returned malformed JSON.',
                    undefined,
                    sent && mutation,
                );
            throw new ApiError(
                0,
                'backend_unavailable',
                'The API could not be reached.',
                undefined,
                sent && mutation,
            );
        }
    }
    return {
        listBikes: (page: Dto.PageOptions = {}, signal?: AbortSignal) =>
            request<Dto.PageResponseOfBikeResponse>('get', '/api/bikes', {
                query: page,
                signal,
            }),
        getBike: (id: string, signal?: AbortSignal) =>
            request<Dto.BikeResponse>('get', '/api/bikes/{id}', { id, signal }),
        createBike: (input: Dto.CreateBike, signal?: AbortSignal) =>
            request<Dto.BikeResponse>('post', '/api/bikes', {
                body: input,
                signal,
            }),
        editBike: (id: string, input: Dto.EditBike, signal?: AbortSignal) =>
            request<Dto.BikeResponse>('put', '/api/bikes/{id}', {
                id,
                body: input,
                signal,
            }),
        getOverview: (id: string, signal?: AbortSignal) =>
            request<Dto.BikeOverviewResponse>(
                'get',
                '/api/bikes/{id}/overview',
                { id, signal },
            ),
        listRides: (
            bikeId: string,
            page: Dto.PageOptions = {},
            signal?: AbortSignal,
        ) =>
            request<Dto.PageResponseOfRideResponse>(
                'get',
                '/api/bikes/{id}/rides',
                { id: bikeId, query: page, signal },
            ),
        getRide: (id: string, signal?: AbortSignal) =>
            request<Dto.RideResponse>('get', '/api/rides/{id}', { id, signal }),
        createRide: (input: Dto.CreateRide, signal?: AbortSignal) =>
            request<Dto.RideResponse>('post', '/api/rides', {
                body: input,
                signal,
            }),
        correctRide: (
            id: string,
            input: Dto.CorrectRide,
            signal?: AbortSignal,
        ) =>
            request<Dto.RideResponse>('put', '/api/rides/{id}', {
                id,
                body: input,
                signal,
            }),
        deleteRide: (
            id: string,
            expectedVersion: number,
            signal?: AbortSignal,
        ) =>
            request<void>('delete', '/api/rides/{id}', {
                id,
                query: { expectedVersion },
                signal,
            }),
        listInstallations: (
            bikeId: string,
            status: 'current' | 'all',
            page: Dto.PageOptions = {},
            signal?: AbortSignal,
        ) =>
            request<Dto.PageResponseOfInstallationListItem>(
                'get',
                '/api/bikes/{id}/installations',
                { id: bikeId, query: { status, ...page }, signal },
            ),
        listComponents: (page: Dto.PageOptions = {}, signal?: AbortSignal) =>
            request<Dto.PageResponseOfComponentResponse>(
                'get',
                '/api/components',
                { query: page, signal },
            ),
        getComponent: (id: string, signal?: AbortSignal) =>
            request<Dto.ComponentResponse>('get', '/api/components/{id}', {
                id,
                signal,
            }),
        getComponentUsage: (id: string, signal?: AbortSignal) =>
            request<Dto.ComponentUsageResponse>(
                'get',
                '/api/components/{id}/usage',
                { id, signal },
            ),
        listComponentMaintenance: (
            id: string,
            page: Dto.PageOptions = {},
            signal?: AbortSignal,
        ) =>
            request<Dto.PageResponseOfMaintenanceResponse>(
                'get',
                '/api/components/{id}/maintenance',
                { id, query: page, signal },
            ),
        createComponent: (input: Dto.CreateComponent, signal?: AbortSignal) =>
            request<Dto.ComponentResponse>('post', '/api/components', {
                body: input,
                signal,
            }),
        createInstallation: (
            input: Dto.CreateInstallation,
            signal?: AbortSignal,
        ) =>
            request<Dto.InstallationResponse>('post', '/api/installations', {
                body: input,
                signal,
            }),
        replaceWithService: (
            installationId: string,
            input: Dto.ReplaceWithService,
            signal?: AbortSignal,
        ) =>
            request<Dto.ReplacementWithServiceResponse>(
                'post',
                '/api/installations/{id}/replacement-with-service',
                { id: installationId, body: input, signal },
            ),
        editEstimate: (
            id: string,
            input: Dto.EditComponentEstimate,
            signal?: AbortSignal,
        ) =>
            request<Dto.ComponentEstimateResponse>(
                'put',
                '/api/components/{id}/estimate',
                { id, body: input, signal },
            ),
        getBikeMaintenance: (bikeId: string, signal?: AbortSignal) =>
            request<Dto.MaintenanceResponse[]>(
                'get',
                '/api/bikes/{id}/maintenance',
                { id: bikeId, signal },
            ),
        createMaintenance: (
            input: Dto.CreateMaintenance,
            signal?: AbortSignal,
        ) =>
            request<Dto.MaintenanceResponse>('post', '/api/maintenance', {
                body: input,
                signal,
            }),
        getReminder: (bikeId: string, signal?: AbortSignal) =>
            request<Dto.ReminderEvaluation>('get', '/api/bikes/{id}/reminder', {
                id: bikeId,
                signal,
            }),
        editReminder: (
            bikeId: string,
            input: Dto.EditReminder,
            signal?: AbortSignal,
        ) =>
            request<Dto.ReminderEvaluation>('put', '/api/bikes/{id}/reminder', {
                id: bikeId,
                body: input,
                signal,
            }),
    };
}
export type ApiClient = ReturnType<typeof createApiClient>;
