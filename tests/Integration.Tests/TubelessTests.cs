using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class TubelessTests
{
    private static readonly DateTimeOffset T = ApiScenario.Start.AddDays(5);

    private static Task<HttpResponseMessage> Tubeless(
        ApiScenario s,
        Guid bike,
        string position,
        long? version,
        DateTimeOffset? at = null
    ) =>
        s.Client.PostAsJsonAsync(
            $"/api/bikes/{bike}/position-exemptions",
            new
            {
                position,
                startUtc = at ?? T,
                expectedInstallationVersion = version,
            }
        );

    private static async Task<string> Code(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;

    [Fact]
    public async Task SwitchingToTubelessEndsTheTubeAndBackToTubedMakesItMissing()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var tube = ApiScenario.Id(await s.Part("inner-tube"));
        var fitted = ApiScenario.Id(await s.Fit(bike, tube, "rear-inner-tube"));
        await s.Ride(bike, ApiScenario.Start.AddHours(1), 40000);
        var response = await Tubeless(s, bike, "rear-inner-tube", 1);
        Assert.Equal(201, (int)response.StatusCode);
        var exemption = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("tubeless", exemption.GetProperty("reason").GetString());
        Assert.Equal(
            T,
            (await s.Read($"/api/installations/{fitted}")).GetProperty("endUtc").GetDateTimeOffset()
        );
        Assert.Equal(40000, await s.Lifetime(tube));
        var status = ApiScenario.Status(
            await s.Read($"/api/bikes/{bike}/usage"),
            "rear-inner-tube"
        );
        Assert.Equal("exempt", status.GetProperty("state").GetString());
        Assert.Equal("tubeless", status.GetProperty("reason").GetString());

        var after = await s.Ride(bike, T.AddDays(1), 10000);
        Assert.DoesNotContain(
            (await s.Read($"/api/bikes/{bike}/usage"))
                .GetProperty("allocationGaps")
                .EnumerateArray(),
            x =>
                x.GetProperty("rideId").GetGuid() == ApiScenario.Id(after)
                && x.GetProperty("position").GetString() == "rear-inner-tube"
        );

        var tubedAt = T.AddDays(3);
        var ended = await s.Client.PutAsJsonAsync(
            $"/api/position-exemptions/{ApiScenario.Id(exemption)}",
            new
            {
                startUtc = T,
                endUtc = tubedAt,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)ended.StatusCode);
        var bikeBody = await s.Read($"/api/bikes/{bike}");
        Assert.Contains(
            bikeBody.GetProperty("missingPositions").EnumerateArray(),
            x => x.GetString() == "rear-inner-tube"
        );
        var missing = ApiScenario.Status(
            await s.Read($"/api/bikes/{bike}/usage"),
            "rear-inner-tube"
        );
        Assert.Equal("missing", missing.GetProperty("state").GetString());
        Assert.Equal(tubedAt, missing.GetProperty("sinceUtc").GetDateTimeOffset());
        var history = await s.Read($"/api/bikes/{bike}/position-exemptions");
        Assert.Equal(tubedAt, history[0].GetProperty("endUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task TubesCannotBeFittedDuringATubelessPeriod()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        Assert.Equal(201, (int)(await Tubeless(s, bike, "front-inner-tube", null)).StatusCode);
        var tube = ApiScenario.Id(await s.Part("inner-tube"));
        var fit = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = tube,
                position = "front-inner-tube",
                startUtc = T.AddDays(1),
            }
        );
        Assert.Equal(409, (int)fit.StatusCode);
        Assert.Equal("installation_overlap", await Code(fit));
    }

    [Fact]
    public async Task ConflictsLeaveTheTubeFitted()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var tube = ApiScenario.Id(await s.Part("inner-tube"));
        var late = ApiScenario.Id(await s.Fit(bike, tube, "rear-inner-tube", T.AddDays(1)));
        var startsAfter = await Tubeless(s, bike, "rear-inner-tube", 1);
        Assert.Equal(409, (int)startsAfter.StatusCode);
        Assert.Equal(
            JsonValueKind.Null,
            (await s.Read($"/api/installations/{late}")).GetProperty("endUtc").ValueKind
        );

        var other = await s.Bike("Other");
        var serviced = ApiScenario.Id(await s.Part("inner-tube"));
        var open = ApiScenario.Id(await s.Fit(other, serviced, "rear-inner-tube"));
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = other,
                componentId = serviced,
                task = "Patch tube",
                performedUtc = T.AddDays(1),
            }
        );
        var orphan = await Tubeless(s, other, "rear-inner-tube", 1);
        Assert.Equal(409, (int)orphan.StatusCode);
        Assert.Equal("maintenance_history_conflict", await Code(orphan));

        foreach (var version in new long?[] { null, 3 })
        {
            var stale = await Tubeless(s, other, "rear-inner-tube", version);
            Assert.Equal(409, (int)stale.StatusCode);
            Assert.Equal(
                JsonValueKind.Null,
                (await s.Read($"/api/installations/{open}")).GetProperty("endUtc").ValueKind
            );
        }
        Assert.Empty((await s.Read($"/api/bikes/{other}/position-exemptions")).EnumerateArray());
    }
}
