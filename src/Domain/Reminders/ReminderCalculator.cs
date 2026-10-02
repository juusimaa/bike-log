using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Rides;

namespace BikeLog.Domain.Reminders;

public sealed class ReminderCalculator : IReminderCalculator
{
    public ReminderEvaluation Calculate(
        ChainLubricationRule? rule,
        Installation? currentChain,
        IReadOnlyList<Ride> rides,
        IReadOnlyList<MaintenanceRecord> maintenance,
        DateTimeOffset evaluatedAtUtc
    )
    {
        var at = evaluatedAtUtc.ToUniversalTime();
        var result = new ReminderEvaluation(
            rule?.Version ?? 0,
            "disabled",
            rule?.Enabled ?? false,
            rule?.Method switch
            {
                LubricationMethod.Oil => "oil",
                LubricationMethod.Wax => "wax",
                _ => null,
            },
            rule?.OilThresholdMetres,
            rule?.WaxThresholdMetres,
            null,
            at,
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );
        if (rule is null || !rule.Enabled || !rule.IsConfigured)
        {
            return result;
        }
        if (
            currentChain is not { Position: InstallationPosition.Chain } chain
            || chain.OwnerId != rule.OwnerId
            || chain.BikeId != rule.BikeId
            || chain.StartUtc > at
            || (chain.EndUtc.HasValue && at >= chain.EndUtc.Value)
        )
        {
            return result with { State = "no-current-chain" };
        }
        var latest = maintenance
            .Where(x =>
                x.OwnerId == rule.OwnerId
                && x.BikeId == rule.BikeId
                && x.ComponentId == chain.ComponentId
                && x.TaskKey == MaintenanceRecord.ChainLubricationTaskKey
                && x.PerformedUtc >= chain.StartUtc
                && x.PerformedUtc <= at
                && (!chain.EndUtc.HasValue || x.PerformedUtc < chain.EndUtc.Value)
            )
            .OrderByDescending(x => x.PerformedUtc)
            .ThenByDescending(x => x.Id)
            .FirstOrDefault();
        var baseline = latest?.PerformedUtc ?? chain.StartUtc;
        long distance = 0;
        foreach (
            var ride in rides.Where(x =>
                x.OwnerId == rule.OwnerId
                && x.BikeId == rule.BikeId
                && x.StartUtc >= baseline
                && x.StartUtc >= chain.StartUtc
                && x.StartUtc <= at
                && (!chain.EndUtc.HasValue || x.StartUtc < chain.EndUtc.Value)
            )
        )
        {
            if (ride.DistanceMetres <= 0)
            {
                throw new DomainValidationException("Ride distance must be positive.");
            }
            distance = checked(distance + ride.DistanceMetres);
        }
        var threshold = (
            rule.Method == LubricationMethod.Oil ? rule.OilThresholdMetres : rule.WaxThresholdMetres
        )!.Value;
        return result with
        {
            State = "ready",
            ActiveThresholdMetres = threshold,
            ComponentId = chain.ComponentId,
            InstallationId = chain.Id,
            BaselineKind = latest is null ? "installation" : "lubrication",
            BaselineUtc = baseline.ToUniversalTime(),
            DistanceSinceBaselineMetres = distance,
            RemainingMetres = distance >= threshold ? 0 : checked(threshold - distance),
            Due = distance >= threshold,
        };
    }
}
