using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Reminders;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Reminders;

public sealed class ReminderReader(BikeLogDbContext db, IReminderCalculator calculator)
{
    public async Task<ReminderEvaluation> ReadAsync(
        Guid ownerId,
        Guid bikeId,
        DateTimeOffset evaluatedAtUtc,
        CancellationToken ct
    )
    {
        var bike =
            await db
                .Bikes.AsNoTracking()
                .SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.Id == bikeId, ct)
            ?? throw ApiInput.Missing();
        var rule = await db
            .ChainLubricationRules.AsNoTracking()
            .SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.BikeId == bikeId, ct);
        var chain = await db
            .Installations.AsNoTracking()
            .SingleOrDefaultAsync(
                x =>
                    x.OwnerId == ownerId
                    && x.BikeId == bikeId
                    && x.Position == InstallationPosition.Chain
                    && x.StartUtc <= evaluatedAtUtc
                    && (!x.EndUtc.HasValue || evaluatedAtUtc < x.EndUtc),
                ct
            );
        var rides = await db
            .Rides.AsNoTracking()
            .Where(x => x.OwnerId == ownerId && x.BikeId == bikeId && x.StartUtc <= evaluatedAtUtc)
            .ToListAsync(ct);
        var maintenance = await db
            .MaintenanceRecords.AsNoTracking()
            .Where(x =>
                x.OwnerId == ownerId && x.BikeId == bikeId && x.PerformedUtc <= evaluatedAtUtc
            )
            .ToListAsync(ct);
        var evaluation = calculator.Calculate(rule, chain, rides, maintenance, evaluatedAtUtc);
        // A retired bike keeps its rule but is never due until reactivated (research D5).
        return bike.Status == BikeStatus.Retired
            ? evaluation with
            {
                State = "paused",
                Due = false,
            }
            : evaluation;
    }
}
