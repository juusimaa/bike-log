using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BikeLog.Integration.Tests;

public class CompositeReplacementTests
{
    private static object Request(
        string? model = " New tyre ",
        decimal? cost = 24.90m,
        string? currency = "EUR"
    ) =>
        new
        {
            newModel = model,
            replacedAtUtc = ApiScenario.Start.AddDays(2),
            expectedInstallationVersion = 1,
            cost,
            currency,
        };

    private static string Route(Guid id) => $"/api/installations/{id}/replacement-with-service";

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
    [InlineData("chain", "chain", "Replace chain")]
    [InlineData("cassette", "cassette", "Replace cassette")]
    [InlineData("tyre", "front-tyre", "Replace front tyre")]
    [InlineData("tyre", "rear-tyre", "Replace rear tyre")]
    public async Task ReplacementCreatesExactlyOneCompleteChapter(
        string type,
        string position,
        string task
    )
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var part = e.Chain;
        var installation = e.Installation;
        if (type != "chain")
        {
            part = ApiScenario.Id(await s.Create("/api/components", new { type, model = "Old" }));
            installation = ApiScenario.Id(
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
        }
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start.AddDays(1),
                distanceMetres = 65000,
            }
        );
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start.AddDays(2),
                distanceMetres = 10000,
            }
        );
        var result = await s.Client.PostAsJsonAsync(Route(installation), Request());
        Assert.Equal(200, (int)result.StatusCode);
        var response = await result.Content.ReadFromJsonAsync<JsonElement>();
        var component = response.GetProperty("component");
        var next = response.GetProperty("newInstallation");
        var old = response.GetProperty("oldInstallation");
        var maintenance = response.GetProperty("maintenance");
        Assert.Equal("New tyre", component.GetProperty("model").GetString());
        Assert.Equal(type, component.GetProperty("type").GetString());
        Assert.Equal(position, next.GetProperty("position").GetString());
        Assert.Equal(2, old.GetProperty("version").GetInt64());
        Assert.Equal(1, next.GetProperty("version").GetInt64());
        Assert.Equal(1, component.GetProperty("version").GetInt64());
        Assert.Equal(1, maintenance.GetProperty("version").GetInt64());
        Assert.Equal(
            next.GetProperty("startUtc").GetDateTimeOffset(),
            old.GetProperty("endUtc").GetDateTimeOffset()
        );
        Assert.Equal(task, maintenance.GetProperty("task").GetString());
        Assert.Equal(24.90m, maintenance.GetProperty("cost").GetDecimal());
        Assert.Equal("EUR", maintenance.GetProperty("currency").GetString());
        Assert.Equal(ApiScenario.Id(component), maintenance.GetProperty("componentId").GetGuid());
        Assert.Equal(
            ApiScenario.Start.AddDays(2),
            maintenance.GetProperty("performedUtc").GetDateTimeOffset()
        );
        Assert.Single(component.GetProperty("installations").EnumerateArray());
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{part}/usage")).GetProperty("lifetimeMetres").GetInt64()
        );
        Assert.Equal(
            10000,
            (await s.Read($"/api/components/{ApiScenario.Id(component)}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
        Assert.Single(
            (await s.Read($"/api/components/{part}")).GetProperty("installations").EnumerateArray()
        );
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Single(await db.MaintenanceRecords.ToListAsync());
        Assert.Equal(type == "chain" ? 2 : 3, await db.Components.CountAsync());
        Assert.Equal(type == "chain" ? 2 : 3, await db.Installations.CountAsync());
    }

    [Fact]
    public async Task StaleRetryCreatesNothing()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(
            200,
            (int)(await s.Client.PostAsJsonAsync(Route(e.Installation), Request())).StatusCode
        );
        var before = await Snapshot(s);
        Assert.Equal(
            409,
            (int)(await s.Client.PostAsJsonAsync(Route(e.Installation), Request())).StatusCode
        );
        Assert.Equal(before, await Snapshot(s));
    }

    [Fact]
    public async Task ConcurrentReplacementHasOneWinner()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var results = await Task.WhenAll(
            s.Client.PostAsJsonAsync(Route(e.Installation), Request()),
            s.Client.PostAsJsonAsync(Route(e.Installation), Request())
        );
        Assert.Equal(new[] { 200, 409 }, results.Select(x => (int)x.StatusCode).Order().ToArray());
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Equal(2, await db.Components.CountAsync());
        Assert.Equal(2, await db.Installations.CountAsync());
        Assert.Equal(1, await db.MaintenanceRecords.CountAsync());
    }

    [Fact]
    public async Task MaintenanceConflictLeavesNoNewComponent()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
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
        var before = await Snapshot(s);
        Assert.Equal(
            409,
            (int)(await s.Client.PostAsJsonAsync(Route(e.Installation), Request())).StatusCode
        );
        Assert.Equal(before, await Snapshot(s));
    }

    [Theory]
    [InlineData(null, null, null)]
    [InlineData(" ", null, null)]
    [InlineData("ok", -1d, "EUR")]
    [InlineData("ok", 1d, null)]
    [InlineData("ok", null, "EUR")]
    [InlineData("ok", 1.001, "EUR")]
    [InlineData("ok", 1d, "eur")]
    public async Task InvalidModelAndCostPairsReturn400(
        string? model,
        double? cost,
        string? currency
    )
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var before = await Snapshot(s);
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        Route(e.Installation),
                        Request(model, cost.HasValue ? (decimal)cost : null, currency)
                    )
                ).StatusCode
        );
        Assert.Equal(before, await Snapshot(s));
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        Route(e.Installation),
                        Request(new string('x', 101))
                    )
                ).StatusCode
        );
    }

    [Fact]
    public async Task OtherOwnerReplacementReturns404()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            var other = Guid.NewGuid();
            var bike = new BikeLog.Domain.Bikes.Bike { OwnerId = other, Name = "Other" };
            var component = new BikeLog.Domain.Components.Component
            {
                OwnerId = other,
                Model = "Other",
            };
            var row = new Installation
            {
                OwnerId = other,
                BikeId = bike.Id,
                ComponentId = component.Id,
                StartUtc = ApiScenario.Start,
            };
            db.AddRange(bike, component, row);
            e = (e.Bike, e.Chain, row.Id);
            await db.SaveChangesAsync();
        }
        var before = await Snapshot(s);
        Assert.Equal(
            404,
            (int)(await s.Client.PostAsJsonAsync(Route(e.Installation), Request())).StatusCode
        );
        Assert.Equal(before, await Snapshot(s));
        Assert.Equal(
            404,
            (int)(await s.Client.PostAsJsonAsync(Route(Guid.NewGuid()), Request())).StatusCode
        );
    }

    private sealed class FailingCalculator : IUsageCalculator
    {
        public UsageCalculation Calculate(
            IReadOnlyList<Ride> rides,
            IReadOnlyList<Installation> installations
        ) => throw new InvalidOperationException("Injected failure");
    }

    [Fact]
    public async Task FailedReplacementLeavesNoRowsOrChangedTotals()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start.AddDays(3),
                distanceMetres = 65000,
            }
        );
        var before = await Snapshot(s);
        await using var failing = new ApiFactory(
            s.ConnectionString,
            configure: services => services.AddSingleton<IUsageCalculator, FailingCalculator>()
        );
        using var client = failing.CreateClient();
        Assert.Equal(
            500,
            (int)(await client.PostAsJsonAsync(Route(e.Installation), Request())).StatusCode
        );
        Assert.Equal(before, await Snapshot(s));
    }
}
