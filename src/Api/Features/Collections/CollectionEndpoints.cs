using System.Data;
using System.Text.Json.Nodes;
using BikeLog.Api.Auth;
using BikeLog.Api.Features.Bikes;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Installations;
using BikeLog.Api.Features.Maintenance;
using BikeLog.Api.Features.Rides;
using BikeLog.Domain;
using BikeLog.Domain.Components;
using BikeLog.Infrastructure.Persistence;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;

namespace BikeLog.Api.Features.Collections;

public static class CollectionEndpoints
{
    private static string OwnerScope(string collection, Guid ownerId) =>
        $"{collection}:owner:{ownerId:D}";

    public static Task DescribeParameters(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken ct
    )
    {
        if (operation.Parameters is null || !operation.Parameters.Any(p => p.Name == "pageSize"))
        {
            return Task.CompletedTask;
        }
        foreach (var parameter in operation.Parameters)
        {
            if (parameter is not OpenApiParameter documented)
            {
                continue;
            }
            switch (parameter.Name)
            {
                case "pageSize":
                    documented.Description = "Page size, default 50; valid range 1 to 200.";
                    documented.Schema = new OpenApiSchema
                    {
                        Type = JsonSchemaType.Integer,
                        Default = JsonValue.Create(50),
                        Minimum = "1",
                        Maximum = "200",
                    };
                    break;
                case "cursor":
                    documented.Description =
                        "Opaque continuation cursor scoped to the owner, route, parent and filter. Refresh the collection after mutations.";
                    break;
                case "status":
                    documented.Description = "Installation filter: current (default) or all.";
                    documented.Schema = new OpenApiSchema
                    {
                        Type = JsonSchemaType.String,
                        Default = JsonValue.Create("current"),
                        Enum = [JsonValue.Create("current")!, JsonValue.Create("all")!],
                    };
                    break;
            }
        }
        return Task.CompletedTask;
    }

    private static (int Size, CursorPosition? Position) Parse(
        int? pageSize,
        string? cursor,
        string scope,
        bool dated
    )
    {
        var size = pageSize ?? 50;
        ApiInput.Require(size is >= 1 and <= 200, "pageSize must be between 1 and 200.");
        var position = string.IsNullOrEmpty(cursor) ? null : PageCursor.Decode(cursor, scope);
        ApiInput.Require(
            position == null || (position.Instant != null) == dated,
            "Invalid cursor keys."
        );
        return (size, position);
    }

    private static PageResponse<TResponse> Page<T, TResponse>(
        List<T> rows,
        int size,
        string scope,
        Func<T, TResponse> map,
        Func<T, DateTimeOffset?> instant
    )
        where T : Entity
    {
        var more = rows.Count > size;
        if (more)
        {
            rows.RemoveAt(size);
        }

        return new(
            rows.Select(map).ToArray(),
            more ? PageCursor.Encode(scope, rows[^1].Id, instant(rows[^1])) : null
        );
    }

    private static async Task<Dictionary<Guid, ComponentResponse>> Components(
        BikeLogDbContext db,
        Guid owner,
        IReadOnlyList<Component> rows,
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
        return rows.ToDictionary(
            x => x.Id,
            x => new ComponentResponse(
                x.Id,
                ComponentValues.Type(x.Type),
                x.Make,
                x.Model,
                x.Version,
                history
                    .Where(i => i.ComponentId == x.Id)
                    .Select(InstallationResponse.From)
                    .ToArray(),
                x.InitialUsageEstimateMetres
            )
        );
    }

    public static void MapCollections(this RouteGroupBuilder api)
    {
        api.MapGet(
                "/bikes",
                async (
                    int? pageSize,
                    string? cursor,
                    BikeLogDbContext db,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var scope = OwnerScope("bikes", owner.OwnerId);
                    var (size, p) = Parse(pageSize, cursor, scope, false);
                    var q = db.Bikes.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId);
                    if (p != null)
                    {
                        q = q.Where(x => x.Id.CompareTo(p.Id) > 0);
                    }

                    var rows = await q.OrderBy(x => x.Id).Take(size + 1).ToListAsync(ct);
                    return Page(rows, size, scope, BikeResponse.From, _ => null);
                }
            )
            .Produces<PageResponse<BikeResponse>>();
        api.MapGet(
                "/components",
                async (
                    int? pageSize,
                    string? cursor,
                    BikeLogDbContext db,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var scope = OwnerScope("components", owner.OwnerId);
                    var (size, p) = Parse(pageSize, cursor, scope, false);
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    var q = db.Components.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId);
                    if (p != null)
                    {
                        q = q.Where(x => x.Id.CompareTo(p.Id) > 0);
                    }

                    var rows = await q.OrderBy(x => x.Id).Take(size + 1).ToListAsync(ct);
                    var responses = await Components(db, owner.OwnerId, rows, ct);
                    return Page(rows, size, scope, x => responses[x.Id], _ => null);
                }
            )
            .Produces<PageResponse<ComponentResponse>>();
        api.MapGet(
                "/bikes/{id:guid}/rides",
                async (
                    Guid id,
                    int? pageSize,
                    string? cursor,
                    BikeLogDbContext db,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct))
                    {
                        throw ApiInput.Missing();
                    }

                    var scope = OwnerScope($"bikes/{id}/rides", owner.OwnerId);
                    var (size, p) = Parse(pageSize, cursor, scope, true);
                    var q = db
                        .Rides.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id);
                    if (p != null)
                    {
                        q = q.Where(x =>
                            x.StartUtc < p.Instant
                            || (x.StartUtc == p.Instant && x.Id.CompareTo(p.Id) < 0)
                        );
                    }

                    return Page(
                        await q.OrderByDescending(x => x.StartUtc)
                            .ThenByDescending(x => x.Id)
                            .Take(size + 1)
                            .ToListAsync(ct),
                        size,
                        scope,
                        RideResponse.From,
                        x => x.StartUtc
                    );
                }
            )
            .Produces<PageResponse<RideResponse>>();
        api.MapGet(
                "/components/{id:guid}/maintenance",
                async (
                    Guid id,
                    int? pageSize,
                    string? cursor,
                    BikeLogDbContext db,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    if (
                        !await db.Components.AnyAsync(
                            x => x.OwnerId == owner.OwnerId && x.Id == id,
                            ct
                        )
                    )
                    {
                        throw ApiInput.Missing();
                    }

                    var scope = OwnerScope($"components/{id}/maintenance", owner.OwnerId);
                    var (size, p) = Parse(pageSize, cursor, scope, true);
                    var q = db
                        .MaintenanceRecords.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && x.ComponentId == id);
                    if (p != null)
                    {
                        q = q.Where(x =>
                            x.PerformedUtc < p.Instant
                            || (x.PerformedUtc == p.Instant && x.Id.CompareTo(p.Id) < 0)
                        );
                    }

                    return Page(
                        await q.OrderByDescending(x => x.PerformedUtc)
                            .ThenByDescending(x => x.Id)
                            .Take(size + 1)
                            .ToListAsync(ct),
                        size,
                        scope,
                        MaintenanceResponse.From,
                        x => x.PerformedUtc
                    );
                }
            )
            .Produces<PageResponse<MaintenanceResponse>>();
        api.MapGet(
                "/bikes/{id:guid}/installations",
                async (
                    Guid id,
                    string? status,
                    int? pageSize,
                    string? cursor,
                    BikeLogDbContext db,
                    ICurrentOwner owner,
                    TimeProvider time,
                    CancellationToken ct
                ) =>
                {
                    var now = time.GetUtcNow();
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct))
                    {
                        throw ApiInput.Missing();
                    }

                    status ??= "current";
                    ApiInput.Require(
                        status is "current" or "all",
                        "status must be current or all."
                    );
                    var scope = OwnerScope($"bikes/{id}/installations/{status}", owner.OwnerId);
                    var (size, p) = Parse(pageSize, cursor, scope, true);
                    var q = db
                        .Installations.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id);
                    if (status == "current")
                    {
                        q = q.Where(x => x.StartUtc <= now && (x.EndUtc == null || x.EndUtc > now));
                    }

                    if (p != null)
                    {
                        q = q.Where(x =>
                            x.StartUtc < p.Instant
                            || (x.StartUtc == p.Instant && x.Id.CompareTo(p.Id) < 0)
                        );
                    }

                    var rows = await q.OrderByDescending(x => x.StartUtc)
                        .ThenByDescending(x => x.Id)
                        .Take(size + 1)
                        .ToListAsync(ct);
                    var ids = rows.Select(x => x.ComponentId).Distinct().ToArray();
                    var components = await db
                        .Components.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && ids.Contains(x.Id))
                        .ToListAsync(ct);
                    var responses = await Components(db, owner.OwnerId, components, ct);
                    return Page(
                        rows,
                        size,
                        scope,
                        x => new InstallationListItem(
                            InstallationResponse.From(x),
                            responses[x.ComponentId]
                        ),
                        x => x.StartUtc
                    );
                }
            )
            .Produces<PageResponse<InstallationListItem>>();
    }
}
