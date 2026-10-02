using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Development;

public static class ProjectionUpgrade
{
    public static async Task RebuildAllAsync(IServiceProvider services, CancellationToken ct)
    {
        using var discovery = services.CreateScope();
        var db = discovery.ServiceProvider.GetRequiredService<BikeLogDbContext>();
        var owners = await db
            .Bikes.Select(x => x.OwnerId)
            .Union(db.Components.Select(x => x.OwnerId))
            .Distinct()
            .OrderBy(x => x)
            .ToListAsync(ct);
        foreach (var owner in owners)
        {
            using var scope = services.CreateScope();
            await scope
                .ServiceProvider.GetRequiredService<OwnerMutation>()
                .ExecuteAsync(owner, _ => Task.FromResult(0), true, ct);
        }
        services
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("ProjectionUpgrade")
            .LogInformation(
                "Explicit usage rebuild completed for {OwnerCount} owners.",
                owners.Count
            );
    }
}
