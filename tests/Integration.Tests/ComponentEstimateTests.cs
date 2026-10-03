using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Components;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests;

public class ComponentEstimateTests
{
    private static Task<HttpResponseMessage> Edit(
        ApiScenario s,
        Guid id,
        long estimate,
        long version = 1
    ) =>
        s.Client.PutAsJsonAsync(
            $"/api/components/{id}/estimate",
            new { initialUsageEstimateMetres = estimate, expectedVersion = version }
        );

    private static Task<JsonElement> Ride(ApiScenario s, Guid bike, long metres, int day = 1) =>
        s.Create(
            "/api/rides",
            new
            {
                bikeId = bike,
                startUtc = ApiScenario.Start.AddDays(day),
                distanceMetres = metres,
            }
        );

    private static async Task<string> Snapshot(ApiScenario s)
    {
        await using var db = TestDatabase.Open(s.ConnectionString);
        return JsonSerializer.Serialize(
            new
            {
                components = await db.Components.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                installations = await db
                    .Installations.AsNoTracking()
                    .OrderBy(x => x.Id)
                    .ToListAsync(),
                rides = await db.Rides.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                maintenance = await db
                    .MaintenanceRecords.AsNoTracking()
                    .OrderBy(x => x.Id)
                    .ToListAsync(),
                componentUsage = await db
                    .ComponentUsages.AsNoTracking()
                    .OrderBy(x => x.ComponentId)
                    .ToListAsync(),
                installationUsage = await db
                    .InstallationUsages.AsNoTracking()
                    .OrderBy(x => x.InstallationId)
                    .ToListAsync(),
            }
        );
    }

    [Theory]
    [InlineData("chain", "chain")]
    [InlineData("cassette", "cassette")]
    [InlineData("tyre", "front-tyre")]
    [InlineData("tyre", "rear-tyre")]
    public async Task EstimateIsSeparateFromCalculatedAndInstallationMileage(
        string type,
        string position
    )
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        if (type != "chain")
        {
            var part = ApiScenario.Id(
                await s.Create(
                    "/api/components",
                    new
                    {
                        type,
                        make = "Synthetic",
                        model = "Estimated part",
                    }
                )
            );
            var installation = ApiScenario.Id(
                await s.Create(
                    "/api/installations",
                    new
                    {
                        bikeId = e.Bike,
                        componentId = part,
                        position,
                        startUtc = ApiScenario.Start,
                    }
                )
            );
            e = (e.Bike, part, installation);
        }
        await Ride(s, e.Bike, 65000);
        var zeroEstimate = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.Equal(65000, zeroEstimate.GetProperty("combinedLifetimeMetres").GetInt64());
        Assert.Equal(0, zeroEstimate.GetProperty("initialUsageEstimateMetres").GetInt64());
        var response = await Edit(s, e.Chain, 120000);
        Assert.Equal(200, (int)response.StatusCode);
        var edit = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(e.Chain, edit.GetProperty("id").GetGuid());
        Assert.Equal(2, edit.GetProperty("version").GetInt64());
        Assert.Equal(65000, edit.GetProperty("calculatedLifetimeMetres").GetInt64());
        Assert.Equal(120000, edit.GetProperty("initialUsageEstimateMetres").GetInt64());
        Assert.Equal(185000, edit.GetProperty("combinedLifetimeMetres").GetInt64());
        var usage = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.Equal(65000, usage.GetProperty("lifetimeMetres").GetInt64());
        Assert.Equal(120000, usage.GetProperty("initialUsageEstimateMetres").GetInt64());
        Assert.Equal(185000, usage.GetProperty("combinedLifetimeMetres").GetInt64());
        Assert.Equal(65000, usage.GetProperty("installations")[0].GetProperty("metres").GetInt64());
        var bike = await s.Read($"/api/bikes/{e.Bike}/usage");
        var current = bike.GetProperty("currentComponents")
            .EnumerateArray()
            .Single(x => x.GetProperty("componentId").GetGuid() == e.Chain);
        AssertCurrent(current);
        if (type == "chain")
        {
            AssertCurrent(bike.GetProperty("currentChain"));
        }
        static void AssertCurrent(JsonElement current)
        {
            Assert.Equal(120000, current.GetProperty("initialUsageEstimateMetres").GetInt64());
            Assert.Equal(185000, current.GetProperty("combinedLifetimeMetres").GetInt64());
            Assert.Equal(65000, current.GetProperty("currentInstallationMetres").GetInt64());
        }
        Assert.Equal(
            120000,
            (await s.Read($"/api/components/{e.Chain}"))
                .GetProperty("initialUsageEstimateMetres")
                .GetInt64()
        );
        Assert.Equal(
            120000,
            (await s.Read("/api/components"))
                .GetProperty("items")
                .EnumerateArray()
                .Single(x => x.GetProperty("id").GetGuid() == e.Chain)
                .GetProperty("initialUsageEstimateMetres")
                .GetInt64()
        );
        Assert.Equal(
            120000,
            (await s.Read($"/api/bikes/{e.Bike}/installations"))
                .GetProperty("items")
                .EnumerateArray()
                .Single(x => x.GetProperty("component").GetProperty("id").GetGuid() == e.Chain)
                .GetProperty("component")
                .GetProperty("initialUsageEstimateMetres")
                .GetInt64()
        );
    }

    [Fact]
    public async Task ChangingEstimateDoesNotRewriteHistory()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await Ride(s, e.Bike, 65000);
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Inspect",
                performedUtc = ApiScenario.Start.AddDays(2),
            }
        );
        var before = await s.Read($"/api/components/{e.Chain}/usage");
        var rides = (await s.Read($"/api/bikes/{e.Bike}/rides")).GetRawText();
        var history = (await s.Read($"/api/components/{e.Chain}/maintenance")).GetRawText();
        Assert.Equal(200, (int)(await Edit(s, e.Chain, 120000)).StatusCode);
        Assert.Equal(200, (int)(await Edit(s, e.Chain, 50000, 2)).StatusCode);
        var after = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.Equal(115000, after.GetProperty("combinedLifetimeMetres").GetInt64());
        Assert.Equal(
            before.GetProperty("installations").GetRawText(),
            after.GetProperty("installations").GetRawText()
        );
        Assert.Equal(
            before.GetProperty("calculatedAtUtc").GetRawText(),
            after.GetProperty("calculatedAtUtc").GetRawText()
        );
        Assert.Equal(rides, (await s.Read($"/api/bikes/{e.Bike}/rides")).GetRawText());
        Assert.Equal(
            history,
            (await s.Read($"/api/components/{e.Chain}/maintenance")).GetRawText()
        );
    }

    [Fact]
    public async Task EstimateFollowsComponentAcrossInstallations()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await Ride(s, e.Bike, 65000);
        Assert.Equal(200, (int)(await Edit(s, e.Chain, 120000)).StatusCode);
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/installations/{e.Installation}",
                        new
                        {
                            startUtc = ApiScenario.Start,
                            endUtc = ApiScenario.Start.AddDays(2),
                            expectedVersion = 1,
                        }
                    )
                ).StatusCode
        );
        var bike = ApiScenario.Id(
            await s.Create(
                "/api/bikes",
                new
                {
                    make = "Synthetic",
                    model = "Other",
                    kind = "road",
                    year = 2026,
                }
            )
        );
        await s.Create(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = e.Chain,
                position = "chain",
                startUtc = ApiScenario.Start.AddDays(2),
            }
        );
        await Ride(s, bike, 10000, 3);
        var usage = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.Equal(75000, usage.GetProperty("lifetimeMetres").GetInt64());
        Assert.Equal(195000, usage.GetProperty("combinedLifetimeMetres").GetInt64());
        Assert.Equal(
            new long[] { 65000, 10000 },
            usage
                .GetProperty("installations")
                .EnumerateArray()
                .Select(x => x.GetProperty("metres").GetInt64())
        );
        Assert.Equal(
            195000,
            (await s.Read($"/api/bikes/{bike}/usage"))
                .GetProperty("currentChain")
                .GetProperty("combinedLifetimeMetres")
                .GetInt64()
        );
    }

    [Fact]
    public async Task StaleAndOtherOwnerEstimateEditsAreRejected()
    {
        await using var s = await ApiScenario.Open();
        var id = await s.Chain();
        Assert.Equal(200, (int)(await Edit(s, id, 120000)).StatusCode);
        var before = await Snapshot(s);
        var stale = await Edit(s, id, 1);
        Assert.Equal(409, (int)stale.StatusCode);
        Assert.Equal(
            2,
            (await stale.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("currentVersion")
                .GetInt64()
        );
        Assert.Equal(before, await Snapshot(s));
        var other = new Component { OwnerId = Guid.NewGuid(), Model = "Other" };
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            db.Add(other);
            await db.SaveChangesAsync();
        }
        before = await Snapshot(s);
        Assert.Equal(404, (int)(await Edit(s, other.Id, -1, 999)).StatusCode);
        Assert.Equal(404, (int)(await Edit(s, Guid.NewGuid(), 1)).StatusCode);
        Assert.Equal(before, await Snapshot(s));
    }

    [Theory]
    [InlineData(-1L)]
    [InlineData(long.MaxValue)]
    public async Task NegativeAndOverflowingEstimatesLeaveStateUnchanged(long estimate)
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await Ride(s, e.Bike, 1);
        var before = await Snapshot(s);
        var result = await Edit(s, e.Chain, estimate);
        Assert.Equal(400, (int)result.StatusCode);
        var text = await result.Content.ReadAsStringAsync();
        Assert.DoesNotContain("OverflowException", text);
        Assert.DoesNotContain("Npgsql", text);
        if (estimate == long.MaxValue)
        {
            Assert.Equal(
                "usage_overflow",
                JsonDocument.Parse(text).RootElement.GetProperty("code").GetString()
            );
        }
        Assert.Equal(before, await Snapshot(s));
    }

    [Fact]
    public async Task LaterRideOverflowRollsBack()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(200, (int)(await Edit(s, e.Chain, long.MaxValue)).StatusCode);
        var before = await Snapshot(s);
        var response = await s.Client.PostAsJsonAsync(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start.AddDays(1),
                distanceMetres = 1,
            }
        );
        Assert.Equal(400, (int)response.StatusCode);
        Assert.Equal(
            "usage_overflow",
            (await response.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("code")
                .GetString()
        );
        Assert.Equal(before, await Snapshot(s));
    }

    [Fact]
    public async Task LaterInstallationOverflowRollsBack()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var unused = await s.Chain();
        Assert.Equal(200, (int)(await Edit(s, unused, long.MaxValue)).StatusCode);
        await Ride(s, e.Bike, 1, 3);
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/installations/{e.Installation}",
                        new
                        {
                            startUtc = ApiScenario.Start,
                            endUtc = ApiScenario.Start.AddDays(2),
                            expectedVersion = 1,
                        }
                    )
                ).StatusCode
        );
        var before = await Snapshot(s);
        var response = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = e.Bike,
                componentId = unused,
                position = "chain",
                startUtc = ApiScenario.Start.AddDays(2),
            }
        );
        Assert.Equal(400, (int)response.StatusCode);
        Assert.Equal(before, await Snapshot(s));
    }

    [Fact]
    public async Task UnusedComponentHasZeroCalculatedUsageAndPersistedEstimate()
    {
        await using var s = await ApiScenario.Open();
        var created = await s.Create(
            "/api/components",
            new
            {
                type = "tyre",
                make = "Synthetic",
                model = "Unused",
            }
        );
        var id = ApiScenario.Id(created);
        Assert.Equal(0, created.GetProperty("initialUsageEstimateMetres").GetInt64());
        var usage = await s.Read($"/api/components/{id}/usage");
        Assert.Equal(0, usage.GetProperty("combinedLifetimeMetres").GetInt64());
        Assert.Equal(200, (int)(await Edit(s, id, 120000)).StatusCode);
        usage = await s.Read($"/api/components/{id}/usage");
        Assert.Equal(0, usage.GetProperty("lifetimeMetres").GetInt64());
        Assert.Equal(120000, usage.GetProperty("initialUsageEstimateMetres").GetInt64());
        Assert.Equal(120000, usage.GetProperty("combinedLifetimeMetres").GetInt64());
        Assert.Empty(usage.GetProperty("installations").EnumerateArray());
    }
}
