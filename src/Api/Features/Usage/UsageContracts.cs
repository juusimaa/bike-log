using BikeLog.Api.Features.Installations;

namespace BikeLog.Api.Features.Usage;

public sealed record InstallationUsageResponse(
    InstallationResponse Installation,
    long Metres,
    long Seconds,
    bool HasUnknownDuration
);

public sealed record ComponentUsageResponse(
    Guid ComponentId,
    long LifetimeMetres,
    long LifetimeSeconds,
    bool HasUnknownDuration,
    long InitialUsageEstimateMetres,
    IReadOnlyList<InstallationUsageResponse> Installations,
    DateTimeOffset? CalculatedAtUtc
);

public sealed record CurrentChainUsage(
    Guid ComponentId,
    Guid InstallationId,
    long CurrentInstallationMetres,
    long CurrentInstallationSeconds,
    bool CurrentInstallationHasUnknownDuration,
    long LifetimeMetres,
    long LifetimeSeconds,
    bool LifetimeHasUnknownDuration,
    long InitialUsageEstimateMetres
);

public sealed record BikeUsageResponse(
    Guid BikeId,
    CurrentChainUsage? CurrentChain,
    IReadOnlyList<Guid> UnallocatedRideIds,
    DateTimeOffset? CalculatedAtUtc
);
