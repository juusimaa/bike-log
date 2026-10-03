import type { components } from './generated/schema';
export type Uuid = string;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type PageOptions = { pageSize?: number; cursor?: string };
export type Position = 'chain' | 'cassette' | 'front-tyre' | 'rear-tyre';
export type View = 'overview' | 'components' | 'rides' | 'maintenance';
export type AllocationGapResponse =
    components['schemas']['AllocationGapResponse'];
export type AnonymousTypeOfInstallationResponseAndInstallationResponse =
    components['schemas']['AnonymousTypeOfInstallationResponseAndInstallationResponse'];
export type BikeOverviewResponse =
    components['schemas']['BikeOverviewResponse'];
export type BikeResponse = components['schemas']['BikeResponse'];
export type BikeUsageResponse = components['schemas']['BikeUsageResponse'];
export type ComponentEstimateResponse =
    components['schemas']['ComponentEstimateResponse'];
export type ComponentResponse = components['schemas']['ComponentResponse'];
export type ComponentUsageResponse =
    components['schemas']['ComponentUsageResponse'];
export type CorrectInstallation = components['schemas']['CorrectInstallation'];
export type CorrectRide = components['schemas']['CorrectRide'];
export type CreateBike = components['schemas']['CreateBike'];
export type CreateComponent = components['schemas']['CreateComponent'];
export type CreateInstallation = components['schemas']['CreateInstallation'];
export type CreateMaintenance = components['schemas']['CreateMaintenance'];
export type CreateRide = components['schemas']['CreateRide'];
export type CurrencySpend = components['schemas']['CurrencySpend'];
export type CurrentChainUsage = components['schemas']['CurrentChainUsage'];
export type CurrentComponentUsage =
    components['schemas']['CurrentComponentUsage'];
export type EditBike = components['schemas']['EditBike'];
export type EditComponentEstimate =
    components['schemas']['EditComponentEstimate'];
export type EditReminder = components['schemas']['EditReminder'];
export type InstallationListItem =
    components['schemas']['InstallationListItem'];
export type InstallationResponse =
    components['schemas']['InstallationResponse'];
export type InstallationUsageResponse =
    components['schemas']['InstallationUsageResponse'];
export type MaintenanceResponse = components['schemas']['MaintenanceResponse'];
export type PageResponseOfBikeResponse =
    components['schemas']['PageResponseOfBikeResponse'];
export type PageResponseOfComponentResponse =
    components['schemas']['PageResponseOfComponentResponse'];
export type PageResponseOfInstallationListItem =
    components['schemas']['PageResponseOfInstallationListItem'];
export type PageResponseOfMaintenanceResponse =
    components['schemas']['PageResponseOfMaintenanceResponse'];
export type PageResponseOfRideResponse =
    components['schemas']['PageResponseOfRideResponse'];
export type ProblemDetails = components['schemas']['ProblemDetails'];
export type RecentActivity = components['schemas']['RecentActivity'];
export type ReminderEvaluation = components['schemas']['ReminderEvaluation'];
export type ReplaceInstallation = components['schemas']['ReplaceInstallation'];
export type ReplacementWithServiceResponse =
    components['schemas']['ReplacementWithServiceResponse'];
export type ReplaceWithService = components['schemas']['ReplaceWithService'];
export type RideResponse = components['schemas']['RideResponse'];
// Runtime validation converts OpenAPI's numeric string alternatives to numbers.
// DTO aliases above remain faithful to the generated schema.
export type Validated<T> = number extends T
    ? Exclude<T, string>
    : T extends readonly (infer U)[]
      ? Validated<U>[]
      : T extends object
        ? { [K in keyof T]: Validated<T[K]> }
        : T;
