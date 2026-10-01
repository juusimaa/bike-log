using BikeLog.Domain.Maintenance;

namespace BikeLog.Domain.Installations;

public static class MaintenanceHistoryRules
{
    public static void Validate(
        IReadOnlyList<Installation> proposed,
        IReadOnlyList<MaintenanceRecord> records
    )
    {
        foreach (var r in records.Where(x => x.ComponentId.HasValue))
        {
            if (
                !proposed.Any(x =>
                    x.OwnerId == r.OwnerId
                    && x.BikeId == r.BikeId
                    && x.ComponentId == r.ComponentId
                    && x.StartUtc <= r.PerformedUtc
                    && (!x.EndUtc.HasValue || r.PerformedUtc < x.EndUtc)
                )
            )
            {
                throw new DomainValidationException(
                    "The installation change would place existing component maintenance outside its dated bike association. Keep dates consistent with the recorded work; maintenance correction is not available in this slice.",
                    "maintenance_history_conflict"
                );
            }
        }
    }
}
