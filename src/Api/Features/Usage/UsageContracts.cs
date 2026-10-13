using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Bikes;

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
    DateTimeOffset? CalculatedAtUtc,
    long CombinedLifetimeMetres
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
    long InitialUsageEstimateMetres,
    long CombinedLifetimeMetres
);

public sealed record CurrentComponentUsage(
    Guid ComponentId,
    Guid InstallationId,
    string Position,
    long CurrentInstallationMetres,
    long CurrentInstallationSeconds,
    bool CurrentInstallationHasUnknownDuration,
    long LifetimeMetres,
    long LifetimeSeconds,
    bool LifetimeHasUnknownDuration,
    long InitialUsageEstimateMetres,
    long CombinedLifetimeMetres
);

public sealed record AllocationGapResponse(Guid RideId, string Position);

/// <summary>State is fitted, exempt, missing or not-recorded, evaluated at the read instant.</summary>
public sealed record PositionStatusResponse(
    string Position,
    string State,
    Guid? ComponentId,
    Guid? InstallationId,
    Guid? ExemptionId,
    string? Reason,
    DateTimeOffset? SinceUtc
)
{
    public static PositionStatusResponse From(PositionStatus s) =>
        new(
            ComponentValues.Position(s.Position),
            ComponentValues.State(s.State),
            s.Installation?.ComponentId,
            s.Installation?.Id,
            s.Exemption?.Id,
            s.Exemption is { } e ? ComponentValues.Reason(e.Reason) : null,
            s.SinceUtc
        );
}

public sealed record PositionGapResponse(
    string Position,
    int RideCount,
    DateTimeOffset FirstRideStartUtc,
    DateTimeOffset LastRideStartUtc
);

public sealed record BikeUsageResponse(
    Guid BikeId,
    CurrentChainUsage? CurrentChain,
    IReadOnlyList<Guid> UnallocatedRideIds,
    DateTimeOffset? CalculatedAtUtc,
    IReadOnlyList<CurrentComponentUsage> CurrentComponents,
    IReadOnlyList<AllocationGapResponse> AllocationGaps,
    IReadOnlyList<PositionStatusResponse> PositionStatuses,
    IReadOnlyList<PositionGapResponse> PositionGaps
);
