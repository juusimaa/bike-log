using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.Extensions.DependencyInjection;

namespace BikeLog.Integration.Tests;

public class MultiComponentApiTests
{
    private static async Task<Guid> Component(ApiScenario s, string type) =>
        ApiScenario.Id(
            await s.Create(
                "/api/components",
                new
                {
                    type,
                    make = "Synthetic",
                    model = "Synthetic part",
                }
            )
        );

    private static async Task<JsonElement> Install(
        ApiScenario s,
        Guid bike,
        Guid part,
        string position,
        DateTimeOffset? at = null
    ) =>
        await s.Create(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = part,
                position,
                startUtc = at ?? ApiScenario.Start,
            }
        );

    [Theory]
    [InlineData("chain", "cassette")]
    [InlineData("chain", "front-tyre")]
    [InlineData("chain", "rear-tyre")]
    [InlineData("cassette", "chain")]
    [InlineData("cassette", "front-tyre")]
    [InlineData("cassette", "rear-tyre")]
    [InlineData("tyre", "chain")]
    [InlineData("tyre", "cassette")]
    public async Task TypePositionMismatchReturns400(string type, string position)
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var part = await Component(s, type);
        var response = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = e.Bike,
                componentId = part,
                position,
                startUtc = ApiScenario.Start,
            }
        );
        Assert.Equal(400, (int)response.StatusCode);
    }

    [Fact]
    public async Task LegacyReplacementRejectsDifferentType()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var part = await Component(s, "cassette");
        var response = await s.Client.PostAsJsonAsync(
            $"/api/installations/{e.Installation}/replacement",
            new
            {
                newComponentId = part,
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(400, (int)response.StatusCode);
        Assert.Equal(
            JsonValueKind.Null,
            (await s.Read($"/api/installations/{e.Installation}")).GetProperty("endUtc").ValueKind
        );
    }

    [Fact]
    public async Task RideAllocatesToAllFourPartsAndResponsesPreservePositions()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var parts = new List<Guid> { e.Chain };
        foreach (
            var (type, position) in new[]
            {
                ("cassette", "cassette"),
                ("tyre", "front-tyre"),
                ("tyre", "rear-tyre"),
            }
        )
        {
            var part = await Component(s, type);
            parts.Add(part);
            var installation = await Install(s, e.Bike, part, position);
            Assert.Equal(position, installation.GetProperty("position").GetString());
            Assert.Equal(
                type,
                (await s.Read($"/api/components/{part}")).GetProperty("type").GetString()
            );
        }
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start,
                distanceMetres = 65000,
                durationSeconds = 3600,
            }
        );
        foreach (var part in parts)
        {
            var usage = await s.Read($"/api/components/{part}/usage");
            Assert.Equal(65000, usage.GetProperty("lifetimeMetres").GetInt64());
            Assert.Equal(3600, usage.GetProperty("lifetimeSeconds").GetInt64());
        }
        var bikeUsage = await s.Read($"/api/bikes/{e.Bike}/usage");
        Assert.Equal(4, bikeUsage.GetProperty("currentComponents").GetArrayLength());
        Assert.Empty(bikeUsage.GetProperty("allocationGaps").EnumerateArray());
        Assert.Equal(
            e.Chain,
            bikeUsage.GetProperty("currentChain").GetProperty("componentId").GetGuid()
        );
        var inventory = await s.Read("/api/components");
        Assert.Equal(
            2,
            inventory
                .GetProperty("items")
                .EnumerateArray()
                .Count(x => x.GetProperty("type").GetString() == "tyre")
        );
    }

    [Fact]
    public async Task CurrentUsageExcludesFutureParts()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var part = await Component(s, "tyre");
        await Install(s, e.Bike, part, "front-tyre", DateTimeOffset.UtcNow.AddYears(10));
        var usage = await s.Read($"/api/bikes/{e.Bike}/usage");
        Assert.Single(usage.GetProperty("currentComponents").EnumerateArray());
        Assert.Equal(
            e.Chain,
            usage.GetProperty("currentComponents")[0].GetProperty("componentId").GetGuid()
        );
    }

    [Fact]
    public async Task HistoricalCorrectionRebuildsAllParts()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var tyre = await Component(s, "tyre");
        var fitted = await Install(s, e.Bike, tyre, "rear-tyre");
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start,
                distanceMetres = 65000,
            }
        );
        var response = await s.Client.PutAsJsonAsync(
            $"/api/installations/{ApiScenario.Id(fitted)}",
            new { startUtc = ApiScenario.Start.AddDays(1), expectedVersion = 1 }
        );
        Assert.Equal(200, (int)response.StatusCode);
        Assert.Equal(
            0,
            (await s.Read($"/api/components/{tyre}/usage")).GetProperty("lifetimeMetres").GetInt64()
        );
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{e.Chain}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
        var usage = await s.Read($"/api/bikes/{e.Bike}/usage");
        Assert.Contains(
            usage.GetProperty("allocationGaps").EnumerateArray(),
            x => x.GetProperty("position").GetString() == "rear-tyre"
        );
        Assert.Empty(usage.GetProperty("unallocatedRideIds").EnumerateArray());
    }

    [Theory]
    [InlineData("cassette", "cassette")]
    [InlineData("tyre", "front-tyre")]
    [InlineData("tyre", "rear-tyre")]
    public async Task LegacyReplacementCopiesPositionAndBoundaryUsesNewPart(
        string type,
        string position
    )
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var old = await Component(s, type);
        var next = await Component(s, type);
        var fitted = await Install(s, e.Bike, old, position);
        var at = ApiScenario.Start.AddDays(1);
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = at.AddTicks(-10),
                distanceMetres = 10000,
            }
        );
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = at,
                distanceMetres = 65000,
                durationSeconds = 3600,
            }
        );
        var response = await s.Client.PostAsJsonAsync(
            $"/api/installations/{ApiScenario.Id(fitted)}/replacement",
            new
            {
                newComponentId = next,
                replacedAtUtc = at,
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(
            position,
            result.GetProperty("newInstallation").GetProperty("position").GetString()
        );
        Assert.Equal(
            10000,
            (await s.Read($"/api/components/{old}/usage")).GetProperty("lifetimeMetres").GetInt64()
        );
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{next}/usage")).GetProperty("lifetimeMetres").GetInt64()
        );
        Assert.True(
            (await s.Read($"/api/components/{old}/usage"))
                .GetProperty("hasUnknownDuration")
                .GetBoolean()
        );
        Assert.False(
            (await s.Read($"/api/components/{next}/usage"))
                .GetProperty("hasUnknownDuration")
                .GetBoolean()
        );
    }

    [Fact]
    public async Task MissingChainStillAllocatesTyresAndExplainsEveryMissingPosition()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var correction = await s.Client.PutAsJsonAsync(
            $"/api/installations/{e.Installation}",
            new { startUtc = ApiScenario.Start.AddDays(1), expectedVersion = 1 }
        );
        Assert.Equal(200, (int)correction.StatusCode);
        var tyre = await Component(s, "tyre");
        await Install(s, e.Bike, tyre, "front-tyre");
        var ride = await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start,
                distanceMetres = 65000,
            }
        );
        var usage = await s.Read($"/api/bikes/{e.Bike}/usage");
        Assert.Equal(ApiScenario.Id(ride), usage.GetProperty("unallocatedRideIds")[0].GetGuid());
        Assert.Equal(
            new[] { "cassette", "chain", "rear-tyre" },
            usage
                .GetProperty("allocationGaps")
                .EnumerateArray()
                .Select(x => x.GetProperty("position").GetString())
                .Order()
                .ToArray()
        );
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{tyre}/usage")).GetProperty("lifetimeMetres").GetInt64()
        );
    }

    [Fact]
    public async Task SamePositionAndSameComponentAcrossPositionsReturn409()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var tyre = await Component(s, "tyre");
        await Install(s, e.Bike, tyre, "front-tyre");
        var next = await Component(s, "tyre");
        foreach (var (part, position) in new[] { (next, "front-tyre"), (tyre, "rear-tyre") })
        {
            var response = await s.Client.PostAsJsonAsync(
                "/api/installations",
                new
                {
                    bikeId = e.Bike,
                    componentId = part,
                    position,
                    startUtc = ApiScenario.Start,
                }
            );
            Assert.Equal(409, (int)response.StatusCode);
        }
        var another = await s.Equipment();
        var acrossBikes = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = another.Bike,
                componentId = tyre,
                position = "rear-tyre",
                startUtc = ApiScenario.Start,
            }
        );
        Assert.Equal(409, (int)acrossBikes.StatusCode);
    }

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public int Reads { get; private set; }

        public override DateTimeOffset GetUtcNow()
        {
            Reads++;
            return now;
        }
    }

    [Fact]
    public async Task CurrentUsageUsesOneInjectedClockInstantAndHalfOpenIntervals()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var at = ApiScenario.Start.AddDays(1);
        var clock = new FixedClock(at);
        var next = await s.Chain();
        var response = await s.Client.PostAsJsonAsync(
            $"/api/installations/{e.Installation}/replacement",
            new
            {
                newComponentId = next,
                replacedAtUtc = at,
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)response.StatusCode);
        await using var factory = new ApiFactory(
            s.ConnectionString,
            configure: services => services.AddSingleton<TimeProvider>(clock)
        );
        using var client = factory.CreateClient();
        var usage = await client.GetFromJsonAsync<JsonElement>($"/api/bikes/{e.Bike}/usage");
        Assert.Equal(next, usage.GetProperty("currentChain").GetProperty("componentId").GetGuid());
        Assert.Equal(
            next,
            usage.GetProperty("currentComponents")[0].GetProperty("componentId").GetGuid()
        );
        Assert.Equal(1, clock.Reads);
    }
}
