import type { components } from './generated/schema';
export type Uuid = string;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type PageOptions = { pageSize?: number; cursor?: string };
// Positions, component types and groups come from GET /api/component-catalog. Clients never
// enumerate them (research D13), so a new catalog entry needs no client code change.
export type Position = string;
export type ComponentType = string;
export type ComponentGroup = string;
export type ExemptionReason = 'none-fitted' | 'tubeless';
export type PositionState = 'fitted' | 'exempt' | 'missing' | 'not-recorded';
export type View =
    'overview' | 'components' | 'rides' | 'maintenance' | 'all-rides';
export type AllocationGapResponse =
    components['schemas']['AllocationGapResponse'];
export type AnonymousTypeOfInstallationResponseAndInstallationResponse =
    components['schemas']['AnonymousTypeOfInstallationResponseAndInstallationResponse'];
export type BikeOverviewResponse =
    components['schemas']['BikeOverviewResponse'];
export type BikeResponse = components['schemas']['BikeResponse'];
export type BikeStatus = BikeResponse['status'];
export type BikeRef = components['schemas']['BikeRef'];
export type BikeState = BikeRef['state'];
export type SetBikeStatus = components['schemas']['SetBikeStatus'];
export type BikeDeletionPreview = components['schemas']['BikeDeletionPreview'];
export type FittedPartPreview = components['schemas']['FittedPartPreview'];
export type DeleteBike = components['schemas']['DeleteBike'];
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
export type RideListItem = components['schemas']['RideListItem'];
export type PageResponseOfRideListItem =
    components['schemas']['PageResponseOfRideListItem'];
export type CatalogPositionResponse =
    components['schemas']['CatalogPositionResponse'];
export type ComponentCatalogResponse =
    components['schemas']['ComponentCatalogResponse'];
export type CorrectPositionExemption =
    components['schemas']['CorrectPositionExemption'];
export type CreatePositionExemption =
    components['schemas']['CreatePositionExemption'];
export type EditComponent = components['schemas']['EditComponent'];
export type FitPair = components['schemas']['FitPair'];
export type FitPairResponse = components['schemas']['FitPairResponse'];
export type GroupWeightResponse = components['schemas']['GroupWeightResponse'];
export type MoveInstallation = components['schemas']['MoveInstallation'];
export type MoveInstallationResponse =
    components['schemas']['MoveInstallationResponse'];
export type PositionExemptionResponse =
    components['schemas']['PositionExemptionResponse'];
export type PositionGapResponse = components['schemas']['PositionGapResponse'];
export type PositionStatusResponse =
    components['schemas']['PositionStatusResponse'];
export type WeightSummaryResponse =
    components['schemas']['WeightSummaryResponse'];
// Runtime validation converts OpenAPI's numeric string alternatives to numbers.
// DTO aliases above remain faithful to the generated schema.
export type Validated<T> = number extends T
    ? Exclude<T, string>
    : T extends readonly (infer U)[]
      ? Validated<U>[]
      : T extends object
        ? { [K in keyof T]: Validated<T[K]> }
        : T;
