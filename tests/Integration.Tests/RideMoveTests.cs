using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class RideMoveTests
{
    private static readonly DateTimeOffset September = DateTimeOffset.Parse("2026-09-01T00:00:00Z");

    private static Task<HttpResponseMessage> Correct(
        ApiScenario s,
        Guid ride,
        Guid bike,
        DateTimeOffset start,
        long version,
        long metres = 30000
    ) =>
        s.Client.PutAsJsonAsync(
            $"/api/rides/{ride}",
            new
            {
                bikeId = bike,
                startUtc = start,
                distanceMetres = metres,
                expectedVersion = version,
            }
        );

    private static async Task<long> Total(ApiScenario s, Guid bike) =>
        (await s.Read($"/api/bikes/{bike}/overview"))
            .GetProperty("recordedDistanceMetres")
            .GetInt64();

    [Fact]
    public async Task MovingARideShiftsUsageBetweenBikesAndTheirParts()
    {
        await using var s = await ApiScenario.Open();
        var a = await s.Bike("Synthetic A");
        var b = await s.Bike("Synthetic B");
        var chainA = await s.Chain();
        var chainB1 = await s.Chain();
        var chainB2 = await s.Chain();
        await s.Fit(a, chainA, "chain", September);
        await s.Create(
            "/api/installations",
            new
            {
                bikeId = b,
                componentId = chainB1,
                position = "chain",
                startUtc = September,
                endUtc = September.AddDays(14),
            }
        );
        await s.Fit(b, chainB2, "chain", September.AddDays(14));
        var at = September.AddDays(9);
        var ride = ApiScenario.Id(await s.Ride(a, at, 30000));
        Assert.Equal(30000, await s.Lifetime(chainA));
        Assert.Equal(30000, await Total(s, a));

        Assert.Equal(200, (int)(await Correct(s, ride, b, at, 1)).StatusCode);
        Assert.Equal(0, await s.Lifetime(chainA));
        Assert.Equal(0, await Total(s, a));
        Assert.Equal(30000, await s.Lifetime(chainB1));
        Assert.Equal(30000, await Total(s, b));

        Assert.Equal(200, (int)(await Correct(s, ride, a, at, 2)).StatusCode);
        Assert.Equal(30000, await s.Lifetime(chainA));
        Assert.Equal(0, await s.Lifetime(chainB1));

        // Moving and re-dating in one request allocates by the destination's fitting at the new start.
        Assert.Equal(200, (int)(await Correct(s, ride, b, September.AddDays(19), 3)).StatusCode);
        Assert.Equal(0, await s.Lifetime(chainA));
        Assert.Equal(0, await s.Lifetime(chainB1));
        Assert.Equal(30000, await s.Lifetime(chainB2));
        Assert.Equal(30000, await Total(s, b));
        Assert.Equal(0, await Total(s, a));
    }

    [Fact]
    public async Task MovingOntoABikeWithoutAChainReportsAGap()
    {
        await using var s = await ApiScenario.Open();
        var (a, chain, _) = await s.Equipment();
        var bare = await s.Bike("Synthetic bare");
        var ride = ApiScenario.Id(await s.Ride(a, ApiScenario.Start.AddDays(1), 30000));
        Assert.Equal(
            200,
            (int)(await Correct(s, ride, bare, ApiScenario.Start.AddDays(1), 1)).StatusCode
        );
        Assert.Equal(0, await s.Lifetime(chain));
        var usage = await s.Read($"/api/bikes/{bare}/usage");
        Assert.Contains(
            usage.GetProperty("allocationGaps").EnumerateArray(),
            x =>
                x.GetProperty("rideId").GetGuid() == ride
                && x.GetProperty("position").GetString() == "chain"
        );
    }

    [Fact]
    public async Task StaleOrForeignMovesChangeNothing()
    {
        await using var s = await ApiScenario.Open();
        var (a, chain, _) = await s.Equipment();
        var b = await s.Bike("Synthetic B");
        var ride = ApiScenario.Id(await s.Ride(a, ApiScenario.Start.AddDays(1), 30000));
        Assert.Equal(
            200,
            (int)(await Correct(s, ride, a, ApiScenario.Start.AddDays(1), 1, 20000)).StatusCode
        );

        var stale = await ApiScenario.Expect(
            await Correct(s, ride, b, ApiScenario.Start.AddDays(1), 1),
            409,
            "stale_version"
        );
        Assert.Equal(2, stale.GetProperty("currentVersion").GetInt64());

        var foreign = new Bike { OwnerId = Guid.NewGuid(), Name = "Other owner" };
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            db.Bikes.Add(foreign);
            await db.SaveChangesAsync();
        }
        await ApiScenario.Expect(
            await Correct(s, ride, foreign.Id, ApiScenario.Start.AddDays(1), 2),
            404,
            "not_found"
        );

        var deleted = await s.Bike("Synthetic deleted");
        await s.MarkDeleted(deleted);
        await ApiScenario.Expect(
            await Correct(s, ride, deleted, ApiScenario.Start.AddDays(1), 2),
            404,
            "not_found"
        );

        var current = await s.Read($"/api/rides/{ride}");
        Assert.Equal(a, current.GetProperty("bikeId").GetGuid());
        Assert.Equal(2, current.GetProperty("version").GetInt64());
        Assert.Equal(20000, await s.Lifetime(chain));
        Assert.Equal(
            JsonValueKind.Array,
            (await s.Read($"/api/bikes/{b}/rides")).GetProperty("items").ValueKind
        );
        Assert.Equal(
            0,
            (await s.Read($"/api/bikes/{b}/rides")).GetProperty("items").GetArrayLength()
        );
    }
}
