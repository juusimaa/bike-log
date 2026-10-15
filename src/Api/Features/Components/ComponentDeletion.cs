using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Components;

public static class ComponentDeletion
{
    /// <summary>
    /// Permanently deletes a part and its fittings inside the caller's owner mutation, which must
    /// rebuild usage. Its maintenance records stay, unlinked, and its usage rows cascade (research D8).
    /// </summary>
    public static async Task DeleteAsync(
        BikeLogDbContext db,
        Guid ownerId,
        Guid componentId,
        CancellationToken ct
    )
    {
        await db
            .MaintenanceRecords.Where(x => x.OwnerId == ownerId && x.ComponentId == componentId)
            .ExecuteUpdateAsync(x => x.SetProperty(r => r.ComponentId, (Guid?)null), ct);
        await db
            .Installations.Where(x => x.OwnerId == ownerId && x.ComponentId == componentId)
            .ExecuteDeleteAsync(ct);
        await db
            .Components.Where(x => x.OwnerId == ownerId && x.Id == componentId)
            .ExecuteDeleteAsync(ct);
    }
}
