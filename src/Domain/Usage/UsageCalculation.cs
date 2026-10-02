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

public sealed record UsageCalculation(
    IReadOnlyList<ComponentUsage> ComponentUsages,
    IReadOnlyList<InstallationUsage> InstallationUsages,
    IReadOnlyList<Guid> UnallocatedRideIds,
    IReadOnlyList<AllocationGap> AllocationGaps
);
