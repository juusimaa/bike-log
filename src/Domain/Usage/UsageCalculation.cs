using BikeLog.Domain.Installations;

namespace BikeLog.Domain.Usage;

public sealed record ComponentUsage(
    Guid ComponentId,
    long LifetimeMetres,
    long LifetimeSeconds,
    bool HasUnknownDuration
);

public sealed record InstallationUsage(
    Guid InstallationId,
    long Metres,
    long Seconds,
    bool HasUnknownDuration
);

public sealed record AllocationGap(Guid RideId, InstallationPosition Position);

/// <summary>Rides on one bike position that started without a recorded component.</summary>
public sealed record PositionGap(
    Guid BikeId,
    InstallationPosition Position,
    int RideCount,
    DateTimeOffset FirstRideStartUtc,
    DateTimeOffset LastRideStartUtc
);

public sealed record UsageCalculation(
    IReadOnlyList<ComponentUsage> ComponentUsages,
    IReadOnlyList<InstallationUsage> InstallationUsages,
    IReadOnlyList<Guid> UnallocatedRideIds,
    IReadOnlyList<AllocationGap> AllocationGaps,
    IReadOnlyList<PositionGap> PositionGaps
);
