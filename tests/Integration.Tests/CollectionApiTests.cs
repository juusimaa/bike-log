using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Rides;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace BikeLog.Integration.Tests;

public class CollectionApiTests
{
    private static JsonElement[] Items(JsonElement page) =>
        page.GetProperty("items").EnumerateArray().ToArray();

    private static string? Cursor(JsonElement page) => page.GetProperty("nextCursor").GetString();

    private static async Task<Guid> Seed(ApiScenario s, int bikes = 1, int rides = 0)
    {
        await using var db = TestDatabase.Open(s.ConnectionString);
        var rows = Enumerable
            .Range(0, bikes)
            .Select(_ => new Bike { OwnerId = ApiScenario.Owner, Name = "Synthetic" })
            .ToArray();
        db.Bikes.AddRange(rows);
        db.Rides.AddRange(
            Enumerable
                .Range(0, rides)
                .Select(i => new Ride
                {
                    OwnerId = ApiScenario.Owner,
                    BikeId = rows[0].Id,
                    StartUtc = ApiScenario.Start.AddMinutes(i / 3),
                    DistanceMetres = 1000,
                })
        );
        await db.SaveChangesAsync();
        return rows[0].Id;
    }

    [Fact]
    public async Task GarageLoadsWithoutKnownIds()
    {
        await using var s = await ApiScenario.Open();
        await Seed(s, 51);
        var first = await s.Read("/api/bikes");
        Assert.Equal(50, Items(first).Length);
        Assert.NotNull(Cursor(first));
        var last = await s.Read("/api/bikes?cursor=" + Cursor(first));
        Assert.Single(Items(last));
        Assert.Null(Cursor(last));
        var ids = Items(first).Concat(Items(last)).Select(ApiScenario.Id).ToArray();
        Assert.Equal(51, ids.Distinct().Count());
        Assert.Equal(ids.OrderBy(x => x), ids);
    }

    [Fact]
    public async Task RidePagesCoverEveryRowOnce()
    {
        await using var s = await ApiScenario.Open();
        var bike = await Seed(s, rides: 201);
        var rows = new List<JsonElement>();
        string? cursor = null;
        do
        {
            var page = await s.Read($"/api/bikes/{bike}/rides?cursor={cursor}");
            if (rows.Count == 0)
            {
                Assert.Equal(50, Items(page).Length);
            }
            rows.AddRange(Items(page));
            cursor = Cursor(page);
        } while (cursor != null);
        Assert.Equal(201, rows.Count);
        Assert.Equal(201, rows.Select(ApiScenario.Id).Distinct().Count());
        Assert.Equal(
            rows.OrderByDescending(x => x.GetProperty("startUtc").GetDateTimeOffset())
                .ThenByDescending(ApiScenario.Id)
                .Select(ApiScenario.Id),
            rows.Select(ApiScenario.Id)
        );
    }

    [Fact]
    public async Task TiedTimesUseIdOrdering()
    {
        await using var s = await ApiScenario.Open();
        var bike = await Seed(s, rides: 3);
        var ids = new List<Guid>();
        string? cursor = null;
        do
        {
            var p = await s.Read($"/api/bikes/{bike}/rides?pageSize=1&cursor={cursor}");
            ids.AddRange(Items(p).Select(ApiScenario.Id));
            cursor = Cursor(p);
        } while (cursor != null);
        Assert.Equal(3, ids.Distinct().Count());
        Assert.Equal(ids.OrderByDescending(x => x), ids);
    }

    private static async Task<(Guid Bike, Guid Component)> Parts(ApiScenario s)
    {
        var bike = await Seed(s);
        await using var db = TestDatabase.Open(s.ConnectionString);
        var c = new Component { OwnerId = ApiScenario.Owner, Model = "Synthetic" };
        var unused = new Component { OwnerId = ApiScenario.Owner, Model = "Unused" };
        db.Components.AddRange(c, unused);
        db.Installations.AddRange(
            new Installation
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                ComponentId = c.Id,
                StartUtc = ApiScenario.Start,
                EndUtc = ApiScenario.Start.AddDays(1),
            },
            new Installation
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                ComponentId = c.Id,
                StartUtc = ApiScenario.Start.AddDays(1),
            }
        );
        await db.SaveChangesAsync();
        return (bike, c.Id);
    }

    [Fact]
    public async Task CurrentAndReplacedPartsAreDiscoverable()
    {
        await using var s = await ApiScenario.Open();
        var (bike, c) = await Parts(s);
        var inventory = Items(await s.Read("/api/components"));
        Assert.Equal(2, inventory.Length);
        Assert.Equal(
            2,
            inventory
                .Single(x => ApiScenario.Id(x) == c)
                .GetProperty("installations")
                .GetArrayLength()
        );
        Assert.Single(Items(await s.Read($"/api/bikes/{bike}/installations")));
        Assert.Equal(2, Items(await s.Read($"/api/bikes/{bike}/installations?status=all")).Length);
    }

    [Fact]
    public async Task ComponentMaintenanceSpansBikes()
    {
        await using var s = await ApiScenario.Open();
        var (bike, c) = await Parts(s);
        var otherBike = await Seed(s);
        await using var db = TestDatabase.Open(s.ConnectionString);
        db.MaintenanceRecords.AddRange(
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                ComponentId = c,
                Task = "clean",
                PerformedUtc = ApiScenario.Start,
            },
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = otherBike,
                ComponentId = c,
                Task = "clean",
                PerformedUtc = ApiScenario.Start.AddDays(1),
            }
        );
        await db.SaveChangesAsync();
        var p = await s.Read($"/api/components/{c}/maintenance?pageSize=1");
        Assert.Equal(otherBike, Items(p)[0].GetProperty("bikeId").GetGuid());
        Assert.Equal(
            bike,
            Items(await s.Read($"/api/components/{c}/maintenance?cursor={Cursor(p)}"))[0]
                .GetProperty("bikeId")
                .GetGuid()
        );
    }

    [Fact]
    public async Task InvalidCursorScopeReturns400()
    {
        await using var s = await ApiScenario.Open();
        var bike = await Seed(s, 2, 3);
        var other = await Seed(s);
        var cursor = Cursor(await s.Read("/api/bikes?pageSize=1"));
        Assert.Equal(
            400,
            (int)(await s.Client.GetAsync("/api/components?cursor=" + cursor)).StatusCode
        );
        cursor = Cursor(await s.Read($"/api/bikes/{bike}/rides?pageSize=1"));
        Assert.Equal(
            400,
            (int)(await s.Client.GetAsync($"/api/bikes/{other}/rides?cursor={cursor}")).StatusCode
        );
        var (partBike, _) = await Parts(s);
        cursor = Cursor(await s.Read($"/api/bikes/{partBike}/installations?status=all&pageSize=1"));
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.GetAsync($"/api/bikes/{partBike}/installations?cursor={cursor}")
                ).StatusCode
        );
    }

    [Fact]
    public async Task PageSizeAndCursorBoundsAreValidated()
    {
        await using var s = await ApiScenario.Open();
        var bike = await Seed(s);
        foreach (
            var query in new[]
            {
                "pageSize=0",
                "pageSize=201",
                "cursor=bad",
                "cursor=" + new string('a', 2049),
                "cursor=e30",
            }
        )
        {
            Assert.Equal(400, (int)(await s.Client.GetAsync("/api/bikes?" + query)).StatusCode);
        }

        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.GetAsync($"/api/bikes/{bike}/installations?status=unknown")
                ).StatusCode
        );
    }

    private sealed class FixedTime : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => ApiScenario.Start.AddDays(2);
    }

    [Fact]
    public async Task FutureOpenInstallationIsNotCurrent()
    {
        await using var s = await ApiScenario.Open();
        var (bike, c) = await Parts(s);
        await using var db = TestDatabase.Open(s.ConnectionString);
        db.Installations.Add(
            new Installation
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                ComponentId = c,
                StartUtc = ApiScenario.Start.AddDays(3),
            }
        );
        await db.SaveChangesAsync();
        await using var factory = new ApiFactory(
            s.ConnectionString,
            configure: services => services.AddSingleton<TimeProvider>(new FixedTime())
        );
        using var client = factory.CreateClient();
        var p = await client.GetFromJsonAsync<JsonElement>($"/api/bikes/{bike}/installations");
        Assert.Single(Items(p));
        Assert.Equal(
            ApiScenario.Start.AddDays(1),
            Items(p)[0].GetProperty("installation").GetProperty("startUtc").GetDateTimeOffset()
        );
    }

    [Fact]
    public async Task EmptyListsAreValid()
    {
        await using var s = await ApiScenario.Open();
        Assert.Empty(Items(await s.Read("/api/bikes")));
        Assert.Empty(Items(await s.Read("/api/components")));
        var bike = await Seed(s);
        Assert.Empty(Items(await s.Read($"/api/bikes/{bike}/rides")));
        Assert.Empty(Items(await s.Read($"/api/bikes/{bike}/installations")));
        var c = await s.Chain();
        Assert.Empty(Items(await s.Read($"/api/components/{c}/maintenance")));
    }

    [Fact]
    public async Task CollectionsAreOwnerScoped()
    {
        await using var s = await ApiScenario.Open();
        await using var db = TestDatabase.Open(s.ConnectionString);
        var owner = Guid.NewGuid();
        var b = new Bike { OwnerId = owner };
        var c = new Component { OwnerId = owner, Model = "Private" };
        db.AddRange(b, c);
        await db.SaveChangesAsync();
        Assert.Empty(Items(await s.Read("/api/bikes")));
        Assert.Empty(Items(await s.Read("/api/components")));
        foreach (
            var path in new[]
            {
                $"/api/bikes/{b.Id}/rides",
                $"/api/bikes/{b.Id}/installations",
                $"/api/components/{c.Id}/maintenance",
                $"/api/bikes/{Guid.NewGuid()}/rides",
            }
        )
        {
            Assert.Equal(404, (int)(await s.Client.GetAsync(path)).StatusCode);
        }
    }
}
