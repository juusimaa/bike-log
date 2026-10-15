using BikeLog.Api.Features.Bikes;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Components;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Components;

public static class ComponentReader
{
    /// <summary>Responses with each part's installation history and the bikes it names.</summary>
    public static async Task<Dictionary<Guid, ComponentResponse>> ResponsesAsync(
        BikeLogDbContext db,
        Guid owner,
        IReadOnlyCollection<Component> rows,
        CancellationToken ct
    )
    {
        var ids = rows.Select(x => x.Id).ToArray();
        var history = await db
            .Installations.AsNoTracking()
            .Where(x => x.OwnerId == owner && ids.Contains(x.ComponentId))
            .OrderBy(x => x.StartUtc)
            .ThenBy(x => x.Id)
            .ToListAsync(ct);
        var bikeIds = history.Select(x => x.BikeId).Distinct().ToArray();
        // Part history names bikes the owner has since deleted (research D3, D6).
        var bikes = await db
            .Bikes.IgnoreQueryFilters()
            .AsNoTracking()
            .Where(x => x.OwnerId == owner && bikeIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, BikeRef.From, ct);
        return rows.ToDictionary(
            x => x.Id,
            x =>
            {
                var own = history.Where(i => i.ComponentId == x.Id).ToArray();
                return ComponentResponse.From(
                    x,
                    own.Select(InstallationResponse.From).ToArray(),
                    own.Select(i => i.BikeId).Distinct().Select(id => bikes[id]).ToArray()
                );
            }
        );
    }

    public static async Task<ComponentResponse> ResponseAsync(
        BikeLogDbContext db,
        Guid owner,
        Component component,
        CancellationToken ct
    ) => (await ResponsesAsync(db, owner, [component], ct))[component.Id];
}
