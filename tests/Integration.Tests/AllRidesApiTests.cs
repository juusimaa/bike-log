using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Rides;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class AllRidesApiTests
{
    [Fact]
    public async Task AllRidesPagesNewestFirstAcrossBikesWithTheirState()
    {
        await using var s = await ApiScenario.Open();
        var a = await s.Bike("Synthetic A");
        var b = await s.Bike("Synthetic B");
        var c = await s.Bike("Synthetic C");
        var at = ApiScenario.Start;
        var rides = new List<(Guid Ride, DateTimeOffset Start)>();
        foreach (var (bike, day) in new[] { (a, 1), (b, 2), (c, 3), (a, 4), (b, 4) })
        {
            // The last two share an instant, so they are ordered by id descending.
            rides.Add((ApiScenario.Id(await s.Ride(bike, at.AddDays(day))), at.AddDays(day)));
        }
        await SetStatus(s, b, "retired", 1);
        await s.MarkDeleted(c);
        var newestFirst = rides
            .OrderByDescending(x => x.Start)
            .ThenByDescending(x => x.Ride)
            .Select(x => x.Ride)
            .ToList();

        var seen = new List<JsonElement>();
        string? cursor = null;
        var pages = 0;
        do
        {
            var page = await s.Read(
                "/api/rides?pageSize=2" + (cursor is null ? "" : $"&cursor={cursor}")
            );
            seen.AddRange(page.GetProperty("items").EnumerateArray());
            var next = page.GetProperty("nextCursor");
            cursor = next.ValueKind == JsonValueKind.Null ? null : next.GetString();
            pages++;
        } while (cursor is not null);
        Assert.Equal(3, pages);
        Assert.Equal(newestFirst, seen.Select(x => x.GetProperty("id").GetGuid()));
        foreach (var item in seen)
        {
            var bike = item.GetProperty("bike");
            Assert.Equal(item.GetProperty("bikeId").GetGuid(), bike.GetProperty("id").GetGuid());
            var id = bike.GetProperty("id").GetGuid();
            var (state, name) =
                id == a ? ("active", "Synthetic A")
                : id == b ? ("retired", "Synthetic B")
                : ("deleted", "Synthetic C");
            Assert.Equal(state, bike.GetProperty("state").GetString());
            Assert.Equal(name, bike.GetProperty("displayName").GetString());
            Assert.True(item.GetProperty("distanceMetres").GetInt64() > 0);
        }

        // A cursor is bound to its collection.
        var perBike = await s.Read($"/api/bikes/{a}/rides?pageSize=1");
        var foreignCursor = perBike.GetProperty("nextCursor").GetString();
        await ApiScenario.Expect(
            await s.Client.GetAsync($"/api/rides?pageSize=1&cursor={foreignCursor}"),
            400,
            "invalid_input"
        );
        foreach (var size in new[] { 0, 201 })
        {
            await ApiScenario.Expect(
                await s.Client.GetAsync($"/api/rides?pageSize={size}"),
                400,
                "invalid_input"
            );
        }
    }

    [Fact]
    public async Task AllRidesShowOnlyTheOwnersRides()
    {
        await using var s = await ApiScenario.Open();
        var mine = await s.Bike();
        await s.Ride(mine, ApiScenario.Start);
        var other = Guid.NewGuid();
        var foreign = new Bike { OwnerId = other, Name = "Other owner" };
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            db.Bikes.Add(foreign);
            db.Rides.Add(
                new Ride
                {
                    OwnerId = other,
                    BikeId = foreign.Id,
                    StartUtc = ApiScenario.Start.AddDays(1),
                    DistanceMetres = 1000,
                }
            );
            await db.SaveChangesAsync();
        }
        var items = (await s.Read("/api/rides")).GetProperty("items");
        Assert.Equal(1, items.GetArrayLength());
        Assert.Equal(mine, items[0].GetProperty("bikeId").GetGuid());
    }

    internal static async Task SetStatus(ApiScenario s, Guid bike, string status, long version)
    {
        var r = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{bike}/status",
            new { status, expectedVersion = version }
        );
        Assert.Equal(200, (int)r.StatusCode);
    }
}
