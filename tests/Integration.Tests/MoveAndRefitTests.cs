using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class MoveAndRefitTests
{
    private static Task<HttpResponseMessage> Move(ApiScenario s, Guid installation, object body) =>
        s.Client.PostAsJsonAsync($"/api/installations/{installation}/move", body);

    private static async Task<string[]> Missing(ApiScenario s, Guid bike) =>
        (await s.Read($"/api/bikes/{bike}"))
            .GetProperty("missingPositions")
            .EnumerateArray()
            .Select(x => x.GetString()!)
            .ToArray();

    [Fact]
    public async Task PedalsMoveBetweenBikesAndKeepTheirUsage()
    {
        await using var s = await ApiScenario.Open();
        var a = await s.Bike("A");
        var b = await s.Bike("B");
        var pedals = ApiScenario.Id(await s.Part("pedals"));
        var fitted = ApiScenario.Id(await s.Fit(a, pedals, "pedals"));
        await s.Ride(a, ApiScenario.Start.AddHours(1), 40000);
        var incompatible = await Move(
            s,
            fitted,
            new
            {
                toBikeId = b,
                toPosition = "saddle",
                movedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(400, (int)incompatible.StatusCode);
        var stale = await Move(
            s,
            fitted,
            new
            {
                toBikeId = b,
                movedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 9,
            }
        );
        Assert.Equal(409, (int)stale.StatusCode);
        var moved = await Move(
            s,
            fitted,
            new
            {
                toBikeId = b,
                movedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)moved.StatusCode);
        var body = await moved.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(b, body.GetProperty("newInstallation").GetProperty("bikeId").GetGuid());
        Assert.Equal(
            "pedals",
            body.GetProperty("newInstallation").GetProperty("position").GetString()
        );
        Assert.Equal(JsonValueKind.Null, body.GetProperty("displacedInstallation").ValueKind);
        await s.Ride(b, ApiScenario.Start.AddDays(2), 25000);
        Assert.Equal(65000, await s.Lifetime(pedals));
    }

    [Fact]
    public async Task OccupiedDestinationNeedsItsVersionAndIsAtomic()
    {
        await using var s = await ApiScenario.Open();
        var a = await s.Bike("A");
        var b = await s.Bike("B");
        var saddleA = ApiScenario.Id(await s.Part("saddle"));
        var fittedA = ApiScenario.Id(await s.Fit(a, saddleA, "saddle"));
        var saddleB = ApiScenario.Id(await s.Part("saddle"));
        var fittedB = ApiScenario.Id(await s.Fit(b, saddleB, "saddle"));
        await s.Ride(b, ApiScenario.Start.AddHours(1), 30000);
        foreach (var destination in new long?[] { null, 4 })
        {
            var refused = await Move(
                s,
                fittedA,
                new
                {
                    toBikeId = b,
                    movedAtUtc = ApiScenario.Start.AddDays(1),
                    expectedInstallationVersion = 1,
                    expectedDestinationInstallationVersion = destination,
                }
            );
            Assert.Equal(409, (int)refused.StatusCode);
            Assert.Equal(
                JsonValueKind.Null,
                (await s.Read($"/api/installations/{fittedA}")).GetProperty("endUtc").ValueKind
            );
            Assert.Equal(
                JsonValueKind.Null,
                (await s.Read($"/api/installations/{fittedB}")).GetProperty("endUtc").ValueKind
            );
        }
        var taken = await Move(
            s,
            fittedA,
            new
            {
                toBikeId = b,
                movedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
                expectedDestinationInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)taken.StatusCode);
        var body = await taken.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(
            fittedB,
            body.GetProperty("displacedInstallation").GetProperty("id").GetGuid()
        );
        Assert.Equal(
            ApiScenario.Start.AddDays(1),
            (await s.Read($"/api/installations/{fittedB}"))
                .GetProperty("endUtc")
                .GetDateTimeOffset()
        );
        Assert.Equal(30000, await s.Lifetime(saddleB));
        Assert.Equal(new[] { "saddle" }, await Missing(s, a));
        Assert.Empty(await Missing(s, b));
        var ride = await s.Ride(a, ApiScenario.Start.AddDays(2), 10000);
        var gaps = (await s.Read($"/api/bikes/{a}/usage")).GetProperty("allocationGaps");
        Assert.Contains(
            gaps.EnumerateArray(),
            x =>
                x.GetProperty("rideId").GetGuid() == ApiScenario.Id(ride)
                && x.GetProperty("position").GetString() == "saddle"
        );
        var list = await s.Read("/api/bikes");
        Assert.Contains(
            list.GetProperty("items").EnumerateArray(),
            x =>
                x.GetProperty("id").GetGuid() == a
                && x.GetProperty("missingPositions").GetArrayLength() == 1
        );
        Assert.Equal(
            "saddle",
            (await s.Read($"/api/bikes/{a}/overview"))
                .GetProperty("bike")
                .GetProperty("missingPositions")[0]
                .GetString()
        );
    }

    [Fact]
    public async Task NeverRecordedPositionsDoNotMakeABikeIncomplete()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        await s.Fit(bike, ApiScenario.Id(await s.Part("chain")), "chain");
        Assert.Empty(await Missing(s, bike));
    }

    [Fact]
    public async Task OldCassetteRefitsToAnotherBikeWithItsHistory()
    {
        await using var s = await ApiScenario.Open();
        var a = await s.Bike("A");
        var b = await s.Bike("B");
        var old = ApiScenario.Id(await s.Part("cassette"));
        var fitted = ApiScenario.Id(await s.Fit(a, old, "cassette"));
        await s.Ride(a, ApiScenario.Start.AddHours(1), 40000);
        var replaced = await s.Client.PostAsJsonAsync(
            $"/api/installations/{fitted}/replacement-with-service",
            new
            {
                newMake = "Synthetic",
                newModel = "New cassette",
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)replaced.StatusCode);
        var next = (await replaced.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("component")
            .GetProperty("id")
            .GetGuid();
        await s.Fit(b, old, "cassette", ApiScenario.Start.AddDays(2));
        await s.Ride(a, ApiScenario.Start.AddDays(3), 20000);
        await s.Ride(b, ApiScenario.Start.AddDays(3), 15000);
        Assert.Equal(55000, await s.Lifetime(old));
        Assert.Equal(20000, await s.Lifetime(next));
        Assert.Equal(
            2,
            (await s.Read($"/api/components/{old}")).GetProperty("installations").GetArrayLength()
        );
    }
}
