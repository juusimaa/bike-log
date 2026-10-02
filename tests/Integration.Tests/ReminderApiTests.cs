using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Maintenance;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace BikeLog.Integration.Tests;

public class ReminderApiTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-02T12:00:00Z");

    private static ApiFactory Frozen(ApiScenario s) =>
        new(s.ConnectionString, timeProvider: new FixedClock());

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static Task<HttpResponseMessage> Edit(
        HttpClient client,
        Guid bike,
        long version = 0,
        string? method = "oil",
        long? oil = 150000,
        long? wax = 300000,
        bool enabled = true
    ) =>
        client.PutAsJsonAsync(
            $"/api/bikes/{bike}/reminder",
            new
            {
                enabled,
                method,
                oilThresholdMetres = oil,
                waxThresholdMetres = wax,
                expectedVersion = version,
            }
        );

    private static async Task<JsonElement> Read(HttpClient client, Guid bike)
    {
        var r = await client.GetAsync($"/api/bikes/{bike}/reminder");
        Assert.Equal(200, (int)r.StatusCode);
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static Task<JsonElement> Ride(
        ApiScenario s,
        Guid bike,
        long distance,
        DateTimeOffset? at = null
    ) =>
        s.Create(
            "/api/rides",
            new
            {
                bikeId = bike,
                startUtc = at ?? Now,
                distanceMetres = distance,
            }
        );

    [Fact]
    public async Task RuleRoundTripsWithVersion()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await using var factory = Frozen(s);
        using var client = factory.CreateClient();
        var missing = await Read(client, e.Bike);
        Assert.Equal(0, missing.GetProperty("ruleVersion").GetInt64());
        Assert.Equal("disabled", missing.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, missing.GetProperty("due").ValueKind);
        await Ride(s, e.Bike, 160000);
        await Ride(s, e.Bike, 900000, Now.AddSeconds(1));
        Assert.Equal(200, (int)(await Edit(client, e.Bike)).StatusCode);
        var oil = await Read(client, e.Bike);
        Assert.Equal(1, oil.GetProperty("ruleVersion").GetInt64());
        Assert.True(oil.GetProperty("due").GetBoolean());
        Assert.Equal(Now, oil.GetProperty("evaluatedAtUtc").GetDateTimeOffset());
        Assert.Equal(200, (int)(await Edit(client, e.Bike, 1, "wax")).StatusCode);
        var wax = await Read(client, e.Bike);
        Assert.Equal(2, wax.GetProperty("ruleVersion").GetInt64());
        Assert.Equal("wax", wax.GetProperty("method").GetString());
        Assert.Equal(140000, wax.GetProperty("remainingMetres").GetInt64());
        Assert.Equal(
            oil.GetProperty("baselineUtc").GetString(),
            wax.GetProperty("baselineUtc").GetString()
        );
        Assert.Empty((await s.Read($"/api/bikes/{e.Bike}/maintenance")).EnumerateArray());
    }

    [Fact]
    public async Task ConcurrentFirstRuleCreationHasOneWinner()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var responses = await Task.WhenAll(Edit(s.Client, e.Bike), Edit(s.Client, e.Bike));
        Assert.Equal(new[] { 200, 409 }, responses.Select(x => (int)x.StatusCode).Order());
        var conflict = await responses
            .Single(x => (int)x.StatusCode == 409)
            .Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, conflict.GetProperty("currentVersion").GetInt64());
    }

    [Theory]
    [InlineData("oil", 999L, 300000L, true)]
    [InlineData("wax", 150000L, 10000001L, true)]
    [InlineData("unknown", 150000L, 300000L, false)]
    [InlineData(null, 150000L, 300000L, true)]
    [InlineData("oil", null, 300000L, true)]
    [InlineData("wax", 150000L, null, true)]
    public async Task InvalidMethodDistancesAndIncompleteEnabledRulesReturn400(
        string? method,
        long? oil,
        long? wax,
        bool enabled
    )
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(
            400,
            (int)
                (
                    await Edit(
                        s.Client,
                        e.Bike,
                        method: method,
                        oil: oil,
                        wax: wax,
                        enabled: enabled
                    )
                ).StatusCode
        );
        Assert.Equal(0, (await Read(s.Client, e.Bike)).GetProperty("ruleVersion").GetInt64());
    }

    [Fact]
    public async Task IncompleteDisabledRuleAndNoChainAreExplicit()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(
            200,
            (int)
                (
                    await Edit(
                        s.Client,
                        e.Bike,
                        method: null,
                        oil: null,
                        wax: 300000,
                        enabled: false
                    )
                ).StatusCode
        );
        var r = await Read(s.Client, e.Bike);
        Assert.Equal("disabled", r.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, r.GetProperty("method").ValueKind);
        Assert.Equal(300000, r.GetProperty("waxThresholdMetres").GetInt64());
        await using var factory = Frozen(s);
        using var client = factory.CreateClient();
        var futureBike = ApiScenario.Id(
            await s.Create(
                "/api/bikes",
                new
                {
                    make = "Synthetic",
                    model = "Future",
                    kind = "road",
                    year = 2026,
                }
            )
        );
        await s.Create(
            "/api/installations",
            new
            {
                bikeId = futureBike,
                componentId = await s.Chain(),
                position = "chain",
                startUtc = Now.AddDays(1),
            }
        );
        Assert.Equal(200, (int)(await Edit(client, futureBike)).StatusCode);
        r = await Read(client, futureBike);
        Assert.Equal("no-current-chain", r.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, r.GetProperty("distanceSinceBaselineMetres").ValueKind);
    }

    [Fact]
    public async Task StaleRulePreservesBothIntervals()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(200, (int)(await Edit(s.Client, e.Bike)).StatusCode);
        Assert.Equal(409, (int)(await Edit(s.Client, e.Bike, 0, "wax", 200000, 400000)).StatusCode);
        var r = await Read(s.Client, e.Bike);
        Assert.Equal(150000, r.GetProperty("oilThresholdMetres").GetInt64());
        Assert.Equal(300000, r.GetProperty("waxThresholdMetres").GetInt64());
        Assert.Equal("oil", r.GetProperty("method").GetString());
    }

    [Fact]
    public async Task OtherOwnerRuleIs404()
    {
        await using var s = await ApiScenario.Open();
        var other = new Bike { OwnerId = Guid.NewGuid() };
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            db.Add(other);
            await db.SaveChangesAsync();
        }
        foreach (var id in new[] { other.Id, Guid.NewGuid() })
        {
            Assert.Equal(404, (int)(await Edit(s.Client, id)).StatusCode);
            Assert.Equal(
                404,
                (int)(await s.Client.GetAsync($"/api/bikes/{id}/reminder")).StatusCode
            );
        }
    }

    [Fact]
    public async Task KeyedLubricationRejectsNonChainAssociation()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var cassette = ApiScenario.Id(
            await s.Create("/api/components", new { type = "cassette", model = "Synthetic" })
        );
        await s.Create(
            "/api/installations",
            new
            {
                bikeId = e.Bike,
                componentId = cassette,
                position = "cassette",
                startUtc = ApiScenario.Start,
            }
        );
        foreach (var component in new Guid?[] { null, cassette })
        {
            var r = await s.Client.PostAsJsonAsync(
                "/api/maintenance",
                new
                {
                    bikeId = e.Bike,
                    componentId = component,
                    task = "Work",
                    taskKey = "chain-lubrication",
                    performedUtc = Now,
                }
            );
            Assert.Equal(400, (int)r.StatusCode);
        }
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        "/api/maintenance",
                        new
                        {
                            bikeId = e.Bike,
                            task = "Work",
                            taskKey = "unknown",
                            performedUtc = Now,
                        }
                    )
                ).StatusCode
        );
        var service = await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Wax bath",
                taskKey = "chain-lubrication",
                performedUtc = Now,
            }
        );
        Assert.Equal("Wax bath", service.GetProperty("task").GetString());
        Assert.Equal("chain-lubrication", service.GetProperty("taskKey").GetString());
        Assert.Equal(JsonValueKind.Null, service.GetProperty("cost").ValueKind);
    }

    [Fact]
    public async Task HistoricalRideEditsChangeReminderImmediately()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await using var factory = Frozen(s);
        using var client = factory.CreateClient();
        Assert.Equal(200, (int)(await Edit(client, e.Bike)).StatusCode);
        var ride = await Ride(s, e.Bike, 160000);
        var id = ApiScenario.Id(ride);
        Assert.True((await Read(client, e.Bike)).GetProperty("due").GetBoolean());
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/rides/{id}",
                        new
                        {
                            bikeId = e.Bike,
                            startUtc = Now,
                            distanceMetres = 10000,
                            expectedVersion = 1,
                        }
                    )
                ).StatusCode
        );
        Assert.Equal(
            10000,
            (await Read(client, e.Bike)).GetProperty("distanceSinceBaselineMetres").GetInt64()
        );
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Service",
                taskKey = "chain-lubrication",
                performedUtc = Now,
            }
        );
        var result = await Read(client, e.Bike);
        Assert.Equal("lubrication", result.GetProperty("baselineKind").GetString());
        Assert.Equal(10000, result.GetProperty("distanceSinceBaselineMetres").GetInt64());
        var usage = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.Equal(10000, usage.GetProperty("lifetimeMetres").GetInt64());
    }

    [Fact]
    public async Task LegacyMigrationKeysOnlyExactChainAssociatedTask()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var cassette = ApiScenario.Id(
            await s.Create("/api/components", new { type = "cassette", model = "Legacy" })
        );
        await using var db = TestDatabase.Open(s.ConnectionString);
        var rows = new[]
        {
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = e.Bike,
                ComponentId = e.Chain,
                Task = "Lubricate chain",
                PerformedUtc = Now,
            },
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = e.Bike,
                Task = "Lubricate chain",
                PerformedUtc = Now,
            },
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = e.Bike,
                ComponentId = cassette,
                Task = "Lubricate chain",
                PerformedUtc = Now,
            },
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = e.Bike,
                ComponentId = e.Chain,
                Task = "lubricate chain",
                PerformedUtc = Now,
            },
        };
        db.AddRange(rows);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261002054614_InitialUsageEstimates");
        await migrator.MigrateAsync();
        var loaded = await db.MaintenanceRecords.AsNoTracking().ToDictionaryAsync(x => x.Id);
        Assert.Equal("chain-lubrication", loaded[rows[0].Id].TaskKey);
        foreach (var row in rows.Skip(1))
        {
            Assert.Null(loaded[row.Id].TaskKey);
        }
    }

    [Fact]
    public async Task EstimateAndFutureServiceDoNotAffectReminderAndReaderUsesCallerSnapshot()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await using var factory = Frozen(s);
        using var client = factory.CreateClient();
        await Edit(client, e.Bike);
        await Ride(s, e.Bike, 160000);
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/components/{e.Chain}/estimate",
                        new { initialUsageEstimateMetres = 900000, expectedVersion = 1 }
                    )
                ).StatusCode
        );
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Future service",
                taskKey = "chain-lubrication",
                performedUtc = Now.AddSeconds(1),
            }
        );
        var r = await Read(client, e.Bike);
        Assert.Equal(160000, r.GetProperty("distanceSinceBaselineMetres").GetInt64());
        Assert.True(r.GetProperty("due").GetBoolean());
        Assert.Equal("installation", r.GetProperty("baselineKind").GetString());
        await using var scope = factory.Services.CreateAsyncScope();
        var db =
            scope.ServiceProvider.GetRequiredService<BikeLog.Infrastructure.Persistence.BikeLogDbContext>();
        await using var snapshot = await db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.RepeatableRead
        );
        var reader =
            scope.ServiceProvider.GetRequiredService<BikeLog.Api.Features.Reminders.ReminderReader>();
        var evaluation = await reader.ReadAsync(
            ApiScenario.Owner,
            e.Bike,
            Now,
            CancellationToken.None
        );
        Assert.Equal(160000, evaluation.DistanceSinceBaselineMetres);
        Assert.Same(snapshot, db.Database.CurrentTransaction);
    }
}
