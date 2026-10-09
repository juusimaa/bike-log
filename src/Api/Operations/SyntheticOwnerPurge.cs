using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Operations;

public sealed record SyntheticPurgeResult(
    int ComponentUsages,
    int InstallationUsages,
    int MaintenanceRecords,
    int Installations,
    int Rides,
    int ReminderRules,
    int Components,
    int Bikes
);

public static class SyntheticOwnerPurge
{
    public static readonly Guid OwnerId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public static async Task<SyntheticPurgeResult> PurgeAsync(
        BikeLogDbContext db,
        IConfiguration configuration,
        string environmentName,
        Guid requestedOwner,
        bool confirmed,
        CancellationToken ct
    )
    {
        if (
            !confirmed
            || requestedOwner != OwnerId
            || environmentName != Environments.Development
            || configuration["AccessMode"] != "Synthetic"
            || !configuration.GetValue<bool>("LocalSyntheticMode")
        )
        {
            throw new InvalidOperationException(
                "Synthetic purge requires exact owner, confirmation, and local synthetic development mode."
            );
        }
        LocalDatabaseGuard.Validate(db, configuration);
        if (await db.BikeLogUsers.AnyAsync(x => x.OwnerId == OwnerId, ct))
        {
            throw new InvalidOperationException(
                "The fixed synthetic owner is registered as a real user."
            );
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var result = new SyntheticPurgeResult(
            await db.ComponentUsages.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.InstallationUsages.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.MaintenanceRecords.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.Installations.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.Rides.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.ChainLubricationRules.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.Components.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct),
            await db.Bikes.Where(x => x.OwnerId == OwnerId).ExecuteDeleteAsync(ct)
        );
        await transaction.CommitAsync(ct);
        return result;
    }
}
