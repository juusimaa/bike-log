using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class FullPositionsApiTests
{
    private static readonly string[] Types =
    [
        "fork",
        "bottom-bracket",
        "handlebar",
        "handlebar-tape",
        "saddle",
        "seatpost",
        "pedals",
        "through-axle",
        "front-derailleur",
        "rear-derailleur",
        "shifters",
        "cassette",
        "chain",
        "brake",
        "brake-lever",
        "crankset",
        "rim",
        "tyre",
        "disc-rotor",
        "inner-tube",
    ];

    [Fact]
    public async Task EveryTypeIsCreatedWithGroupAndOptionalWeight()
    {
        await using var s = await ApiScenario.Open();
        foreach (var type in Types)
        {
            var part = await s.Part(type, 250);
            Assert.Equal(type, part.GetProperty("type").GetString());
            Assert.Equal(250, part.GetProperty("weightGrams").GetInt32());
            var group = part.GetProperty("group").GetString();
            Assert.Contains(group, new[] { "build", "groupset", "wheels" });
        }
        var unweighed = await s.Part("saddle");
        Assert.Equal(JsonValueKind.Null, unweighed.GetProperty("weightGrams").ValueKind);
        Assert.Equal("build", unweighed.GetProperty("group").GetString());
        Assert.Equal(
            "groupset",
            (await s.Read($"/api/components/{ApiScenario.Id(await s.Part("chain"))}"))
                .GetProperty("group")
                .GetString()
        );
    }

    [Fact]
    public async Task ImplausibleWeightsReturn400()
    {
        await using var s = await ApiScenario.Open();
        foreach (var weight in new object[] { 0, -5, 20001, 12.5 })
        {
            var r = await s.Client.PostAsJsonAsync(
                "/api/components",
                new
                {
                    type = "saddle",
                    make = "Synthetic",
                    model = "Synthetic",
                    weightGrams = weight,
                }
            );
            Assert.Equal(400, (int)r.StatusCode);
        }
    }

    [Fact]
    public async Task SaddleFitsOnlyTheSaddlePositionOnce()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        var wrong = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = saddle,
                position = "handlebar",
                startUtc = ApiScenario.Start,
            }
        );
        Assert.Equal(400, (int)wrong.StatusCode);
        await s.Fit(bike, saddle, "saddle");
        var second = ApiScenario.Id(await s.Part("saddle"));
        var overlap = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = second,
                position = "saddle",
                startUtc = ApiScenario.Start.AddDays(1),
            }
        );
        Assert.Equal(409, (int)overlap.StatusCode);
        Assert.Equal(
            "installation_overlap",
            (await overlap.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()
        );
        await s.Ride(bike, ApiScenario.Start.AddHours(1), 40000);
        Assert.Equal(40000, await s.Lifetime(saddle));
    }

    [Fact]
    public async Task CatalogAndPositionStatusesCoverEveryPosition()
    {
        await using var s = await ApiScenario.Open();
        var catalog = await s.Read("/api/component-catalog");
        Assert.Equal(27, catalog.GetProperty("positions").GetArrayLength());
        Assert.Equal(
            new[] { "build", "groupset", "wheels" },
            catalog.GetProperty("groups").EnumerateArray().Select(x => x.GetString()).ToArray()
        );
        var bike = await s.Bike();
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        await s.Fit(bike, saddle, "saddle");
        var usage = await s.Read($"/api/bikes/{bike}/usage");
        var statuses = usage.GetProperty("positionStatuses");
        Assert.Equal(27, statuses.GetArrayLength());
        Assert.Equal(
            catalog
                .GetProperty("positions")
                .EnumerateArray()
                .Select(x => x.GetProperty("position").GetString()),
            statuses.EnumerateArray().Select(x => x.GetProperty("position").GetString())
        );
        Assert.Equal(
            "fitted",
            ApiScenario.Status(usage, "saddle").GetProperty("state").GetString()
        );
        Assert.Equal(
            saddle,
            ApiScenario.Status(usage, "saddle").GetProperty("componentId").GetGuid()
        );
        Assert.Equal(
            26,
            statuses
                .EnumerateArray()
                .Count(x => x.GetProperty("state").GetString() == "not-recorded")
        );
        var overview = await s.Read($"/api/bikes/{bike}/overview");
        Assert.Equal(27, overview.GetProperty("positionStatuses").GetArrayLength());
        Assert.True(overview.TryGetProperty("positionGaps", out _));
    }

    [Fact]
    public async Task EndedInstallationOrExemptionMakesThePositionMissing()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        var fitted = await s.Fit(bike, saddle, "saddle");
        var removedAt = ApiScenario.Start.AddDays(3);
        var end = await s.Client.PutAsJsonAsync(
            $"/api/installations/{ApiScenario.Id(fitted)}",
            new
            {
                startUtc = ApiScenario.Start,
                endUtc = removedAt,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)end.StatusCode);
        var exemption = await s.Create(
            $"/api/bikes/{bike}/position-exemptions",
            new { position = "front-derailleur", startUtc = ApiScenario.Start }
        );
        Assert.Equal("none-fitted", exemption.GetProperty("reason").GetString());
        var tubeless = await s.Create(
            $"/api/bikes/{bike}/position-exemptions",
            new { position = "rear-inner-tube", startUtc = ApiScenario.Start }
        );
        var usage = await s.Read($"/api/bikes/{bike}/usage");
        var missing = ApiScenario.Status(usage, "saddle");
        Assert.Equal("missing", missing.GetProperty("state").GetString());
        Assert.Equal(removedAt, missing.GetProperty("sinceUtc").GetDateTimeOffset());
        Assert.Equal(
            "not-recorded",
            ApiScenario.Status(usage, "fork").GetProperty("state").GetString()
        );
        Assert.Equal(
            "exempt",
            ApiScenario.Status(usage, "rear-inner-tube").GetProperty("state").GetString()
        );
        Assert.Equal(
            ApiScenario.Id(tubeless),
            ApiScenario.Status(usage, "rear-inner-tube").GetProperty("exemptionId").GetGuid()
        );

        var endedAt = ApiScenario.Start.AddDays(5);
        var ended = await s.Client.PutAsJsonAsync(
            $"/api/position-exemptions/{ApiScenario.Id(exemption)}",
            new
            {
                startUtc = ApiScenario.Start,
                endUtc = endedAt,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)ended.StatusCode);
        var after = ApiScenario.Status(
            await s.Read($"/api/bikes/{bike}/usage"),
            "front-derailleur"
        );
        Assert.Equal("missing", after.GetProperty("state").GetString());
        Assert.Equal(endedAt, after.GetProperty("sinceUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task NoneFittedSuppressesFrontDerailleurGaps()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var created = await s.Create(
            $"/api/bikes/{bike}/position-exemptions",
            new { position = "front-derailleur", startUtc = ApiScenario.Start }
        );
        Assert.Equal("front-derailleur", created.GetProperty("position").GetString());
        Assert.Equal(JsonValueKind.Null, created.GetProperty("endUtc").ValueKind);
        await s.Ride(bike, ApiScenario.Start.AddHours(1));
        var usage = await s.Read($"/api/bikes/{bike}/usage");
        Assert.DoesNotContain(
            usage.GetProperty("allocationGaps").EnumerateArray(),
            x => x.GetProperty("position").GetString() == "front-derailleur"
        );
        Assert.DoesNotContain(
            usage.GetProperty("positionGaps").EnumerateArray(),
            x => x.GetProperty("position").GetString() == "front-derailleur"
        );
        var saddleGap = usage
            .GetProperty("positionGaps")
            .EnumerateArray()
            .Single(x => x.GetProperty("position").GetString() == "saddle");
        Assert.Equal(1, saddleGap.GetProperty("rideCount").GetInt32());
        var listed = await s.Read($"/api/bikes/{bike}/position-exemptions");
        Assert.Single(listed.EnumerateArray());

        var saddle = await s.Client.PostAsJsonAsync(
            $"/api/bikes/{bike}/position-exemptions",
            new { position = "saddle", startUtc = ApiScenario.Start }
        );
        Assert.Equal(400, (int)saddle.StatusCode);
    }

    [Fact]
    public async Task MarkingNoneFittedRequiresTheCurrentInstallationVersion()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var derailleur = ApiScenario.Id(await s.Part("front-derailleur"));
        var fitted = ApiScenario.Id(await s.Fit(bike, derailleur, "front-derailleur"));
        foreach (var version in new long?[] { null, 7 })
        {
            var stale = await s.Client.PostAsJsonAsync(
                $"/api/bikes/{bike}/position-exemptions",
                new
                {
                    position = "front-derailleur",
                    startUtc = ApiScenario.Start.AddDays(2),
                    expectedInstallationVersion = version,
                }
            );
            Assert.Equal(409, (int)stale.StatusCode);
            Assert.Equal(
                JsonValueKind.Null,
                (await s.Read($"/api/installations/{fitted}")).GetProperty("endUtc").ValueKind
            );
        }
        await s.Create(
            $"/api/bikes/{bike}/position-exemptions",
            new
            {
                position = "front-derailleur",
                startUtc = ApiScenario.Start.AddDays(2),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(
            ApiScenario.Start.AddDays(2),
            (await s.Read($"/api/installations/{fitted}")).GetProperty("endUtc").GetDateTimeOffset()
        );
        var status = ApiScenario.Status(
            await s.Read($"/api/bikes/{bike}/usage"),
            "front-derailleur"
        );
        Assert.Equal("exempt", status.GetProperty("state").GetString());
        Assert.Equal("none-fitted", status.GetProperty("reason").GetString());
    }
}
