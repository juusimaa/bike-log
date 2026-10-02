using System.Data.Common;
using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Rides;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace BikeLog.Integration.Tests;

public class BikeOverviewTests
{
    private sealed class CountingClock : TimeProvider
    {
        public int Calls;

        public override DateTimeOffset GetUtcNow()
        {
            Calls++;
            return ApiScenario.Start.AddDays(10);
        }
    }

    [Fact]
    public async Task FutureOpenPartsAreNotCurrent()
    {
        await using var s = await ApiScenario.Open();
        var bike = ApiScenario.Id(await s.Create("/api/bikes", BikeMetadataTests.Metadata()));
        var chain = await s.Chain();
        await s.Create(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = chain,
                position = "chain",
                startUtc = ApiScenario.Start.AddDays(20),
            }
        );
        var clock = new CountingClock();
        await using var factory = new ApiFactory(s.ConnectionString, timeProvider: clock);
        using var client = factory.CreateClient();
        var result = await client.GetFromJsonAsync<JsonElement>($"/api/bikes/{bike}/overview");
        Assert.Empty(result.GetProperty("currentComponents").EnumerateArray());
        Assert.Equal(
            JsonValueKind.Null,
            result.GetProperty("reminder").GetProperty("installationId").ValueKind
        );
        Assert.Equal(1, clock.Calls);
        Assert.Equal(
            result.GetProperty("evaluatedAtUtc").GetString(),
            result.GetProperty("reminder").GetProperty("evaluatedAtUtc").GetString()
        );
    }

    private sealed class SnapshotPause : DbCommandInterceptor
    {
        public TaskCompletionSource Entered { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Resume { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int paused;

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default
        )
        {
            if (
                command.CommandText.Contains("rides", StringComparison.OrdinalIgnoreCase)
                && Interlocked.Exchange(ref paused, 1) == 0
            )
            {
                Entered.TrySetResult();
                await Resume.Task.WaitAsync(cancellationToken);
            }
            return result;
        }
    }

    [Fact]
    public async Task ConcurrentReplacementProducesCoherentSnapshot()
    {
        await using var s = await ApiScenario.Open();
        var (bike, chain, install) = await s.Equipment();
        var rule = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{bike}/reminder",
            new
            {
                enabled = true,
                method = "oil",
                oilThresholdMetres = 1000,
                waxThresholdMetres = 2000,
                expectedVersion = 0,
            }
        );
        Assert.Equal(200, (int)rule.StatusCode);
        var pause = new SnapshotPause();
        await using var factory = new ApiFactory(
            s.ConnectionString,
            configure: services =>
                services.AddDbContext<BikeLogDbContext>(options => options.AddInterceptors(pause))
        );
        using var client = factory.CreateClient();
        var read = client.GetFromJsonAsync<JsonElement>($"/api/bikes/{bike}/overview");
        await pause.Entered.Task.WaitAsync(TimeSpan.FromSeconds(15));
        try
        {
            var replacementResponse = await s.Client.PostAsJsonAsync(
                $"/api/installations/{install}/replacement-with-service",
                new
                {
                    newModel = "New chain",
                    replacedAtUtc = ApiScenario.Start.AddDays(2),
                    expectedInstallationVersion = 1,
                }
            );
            Assert.Equal(200, (int)replacementResponse.StatusCode);
            var replacement = await replacementResponse.Content.ReadFromJsonAsync<JsonElement>();
            pause.Resume.TrySetResult();
            var old = await read;
            Assert.Equal(
                install,
                old.GetProperty("currentComponents")[0].GetProperty("installationId").GetGuid()
            );
            Assert.Equal(
                chain,
                old.GetProperty("currentComponents")[0].GetProperty("componentId").GetGuid()
            );
            Assert.Equal(
                install,
                old.GetProperty("reminder").GetProperty("installationId").GetGuid()
            );
            Assert.Equal(0, old.GetProperty("maintenanceRecordCount").GetInt32());
            var next = await s.Read($"/api/bikes/{bike}/overview");
            var newId = replacement.GetProperty("newInstallation").GetProperty("id").GetGuid();
            Assert.Equal(
                newId,
                next.GetProperty("currentComponents")[0].GetProperty("installationId").GetGuid()
            );
            Assert.Equal(
                newId,
                next.GetProperty("reminder").GetProperty("installationId").GetGuid()
            );
            Assert.Equal(1, next.GetProperty("maintenanceRecordCount").GetInt32());
        }
        finally
        {
            pause.Resume.TrySetResult();
        }
    }

    [Fact]
    public async Task SummaryIncludesAllPages()
    {
        await using var s = await ApiScenario.Open();
        var (bike, _, _) = await s.Equipment();
        await using var db = TestDatabase.Open(s.ConnectionString);
        db.Rides.AddRange(
            Enumerable
                .Range(0, 201)
                .Select(i => new Ride
                {
                    OwnerId = ApiScenario.Owner,
                    BikeId = bike,
                    StartUtc = ApiScenario.Start.AddDays(i * 10),
                    DistanceMetres = 1000,
                })
        );
        await db.SaveChangesAsync();
        var overview = await s.Read($"/api/bikes/{bike}/overview");
        Assert.Equal(201, overview.GetProperty("rideCount").GetInt32());
        Assert.Equal(201000, overview.GetProperty("recordedDistanceMetres").GetInt64());
    }

    [Fact]
    public async Task CostsStaySeparatedAndUnknownCostsVisible()
    {
        await using var s = await ApiScenario.Open();
        var (bike, _, _) = await s.Equipment();
        await using var db = TestDatabase.Open(s.ConnectionString);
        foreach (
            var (cost, currency) in new (decimal?, string?)[]
            {
                (24.90m, "EUR"),
                (0m, "EUR"),
                (10m, "USD"),
                (null, null),
            }
        )
        {
            db.MaintenanceRecords.Add(
                new MaintenanceRecord
                {
                    OwnerId = ApiScenario.Owner,
                    BikeId = bike,
                    Task = "Service",
                    PerformedUtc = ApiScenario.Start,
                    Cost = cost,
                    Currency = currency,
                }
            );
        }
        await db.SaveChangesAsync();
        var result = await s.Read($"/api/bikes/{bike}/overview");
        var spend = result.GetProperty("spendingByCurrency").EnumerateArray().ToArray();
        Assert.Equal(
            new[] { "EUR", "USD" },
            spend.Select(x => x.GetProperty("currency").GetString())
        );
        Assert.Equal(
            new[] { 24.90m, 10m },
            spend.Select(x => x.GetProperty("amount").GetDecimal())
        );
        Assert.Equal(1, result.GetProperty("unknownCostRecordCount").GetInt32());
        Assert.Equal(4, result.GetProperty("maintenanceRecordCount").GetInt32());
    }

    [Fact]
    public async Task RecentActivityOrdersTiesDeterministically()
    {
        await using var s = await ApiScenario.Open();
        var (bike, _, _) = await s.Equipment();
        await using var db = TestDatabase.Open(s.ConnectionString);
        var first = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var second = Guid.Parse("00000000-0000-0000-0000-000000000002");
        db.Rides.AddRange(
            new Ride
            {
                Id = second,
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                StartUtc = ApiScenario.Start,
                DistanceMetres = 2,
            },
            new Ride
            {
                Id = first,
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                StartUtc = ApiScenario.Start,
                DistanceMetres = 1,
            }
        );
        db.MaintenanceRecords.Add(
            new MaintenanceRecord
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                Task = "Oil",
                PerformedUtc = ApiScenario.Start,
            }
        );
        await db.SaveChangesAsync();
        var activity = (await s.Read($"/api/bikes/{bike}/overview"))
            .GetProperty("recentActivity")
            .EnumerateArray()
            .ToArray();
        Assert.Equal(3, activity.Length);
        Assert.Equal("maintenance", activity[0].GetProperty("kind").GetString());
        Assert.Equal(first, activity[1].GetProperty("id").GetGuid());
        Assert.Equal(second, activity[2].GetProperty("id").GetGuid());
        Assert.Equal("Ride 2026-01-01", activity[1].GetProperty("title").GetString());
    }

    [Fact]
    public async Task OverviewMatchesUsageAndReminder()
    {
        await using var s = await ApiScenario.Open();
        var (bike, _, _) = await s.Equipment();
        var overview = await s.Read($"/api/bikes/{bike}/overview");
        var usage = await s.Read($"/api/bikes/{bike}/usage");
        Assert.Equal(
            usage.GetProperty("currentComponents").GetRawText(),
            overview.GetProperty("currentComponents").GetRawText()
        );
        Assert.Equal(
            usage.GetProperty("allocationGaps").GetRawText(),
            overview.GetProperty("allocationGaps").GetRawText()
        );
        var reminder = await s.Read($"/api/bikes/{bike}/reminder");
        foreach (var field in reminder.EnumerateObject().Where(x => x.Name != "evaluatedAtUtc"))
        {
            Assert.Equal(
                field.Value.GetRawText(),
                overview.GetProperty("reminder").GetProperty(field.Name).GetRawText()
            );
        }
        Assert.Equal(bike, overview.GetProperty("bike").GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task OtherOwnerOverviewIs404()
    {
        await using var s = await ApiScenario.Open();
        await using var db = TestDatabase.Open(s.ConnectionString);
        var bike = new BikeLog.Domain.Bikes.Bike { OwnerId = Guid.NewGuid(), Name = "Private" };
        db.Bikes.Add(bike);
        await db.SaveChangesAsync();
        Assert.Equal(
            404,
            (int)(await s.Client.GetAsync($"/api/bikes/{bike.Id}/overview")).StatusCode
        );
    }

    [Fact]
    public async Task OverflowIsSanitized()
    {
        await using var s = await ApiScenario.Open();
        var (bike, _, _) = await s.Equipment();
        await using var db = TestDatabase.Open(s.ConnectionString);
        db.Rides.AddRange(
            new Ride
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                StartUtc = ApiScenario.Start,
                DistanceMetres = long.MaxValue,
            },
            new Ride
            {
                OwnerId = ApiScenario.Owner,
                BikeId = bike,
                StartUtc = ApiScenario.Start.AddDays(1),
                DistanceMetres = 1,
            }
        );
        await db.SaveChangesAsync();
        var response = await s.Client.GetAsync($"/api/bikes/{bike}/overview");
        Assert.Equal(400, (int)response.StatusCode);
        Assert.Equal(
            "usage_overflow",
            (await response.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("code")
                .GetString()
        );
    }
}
