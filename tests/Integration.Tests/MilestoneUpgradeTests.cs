using BikeLog.Api.Development;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BikeLog.Integration.Tests;

public class MilestoneUpgradeTests
{
    [Fact]
    public async Task UpgradeRebuildIsRepeatableAndOwnerAtomic()
    {
        await using var scenario = await ApiScenario.Open();
        var equipment = await scenario.Equipment();
        await scenario.Create(
            "/api/rides",
            new
            {
                bikeId = equipment.Bike,
                startUtc = ApiScenario.Start.AddHours(1),
                distanceMetres = 65000,
            }
        );
        await ProjectionUpgrade.RebuildAllAsync(scenario.Factory.Services, default);
        await using var before = TestDatabase.Open(scenario.ConnectionString);
        var projection = await before.ComponentUsages.AsNoTracking().SingleAsync();
        await before.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE \"Components\" SET \"InitialUsageEstimateMetres\" = {long.MaxValue} WHERE \"Id\" = {equipment.Chain}"
        );
        await Assert.ThrowsAsync<OverflowException>(() =>
            ProjectionUpgrade.RebuildAllAsync(scenario.Factory.Services, default)
        );
        await using var after = TestDatabase.Open(scenario.ConnectionString);
        var retained = await after.ComponentUsages.AsNoTracking().SingleAsync();
        Assert.Equal(projection.LifetimeMetres, retained.LifetimeMetres);
        Assert.Equal(projection.CalculatedAtUtc, retained.CalculatedAtUtc);
        Assert.Equal(1, await after.Rides.CountAsync());
        await after.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE \"Components\" SET \"InitialUsageEstimateMetres\" = 0 WHERE \"Id\" = {equipment.Chain}"
        );
        await ProjectionUpgrade.RebuildAllAsync(scenario.Factory.Services, default);
        await ProjectionUpgrade.RebuildAllAsync(scenario.Factory.Services, default);
        Assert.Equal(
            65000,
            (await after.ComponentUsages.AsNoTracking().SingleAsync()).LifetimeMetres
        );
    }

    [Fact]
    public async Task UpgradePreservesFoundationHistory()
    {
        await using var fixture = new PostgresFixture();
        await fixture.InitializeAsync();
        var owner = ApiScenario.Owner;
        var bike = Guid.NewGuid();
        var chainA = Guid.NewGuid();
        var chainB = Guid.NewGuid();
        var installationA = Guid.NewGuid();
        var installationB = Guid.NewGuid();
        var rideA = Guid.NewGuid();
        var rideB = Guid.NewGuid();
        var service = Guid.NewGuid();
        var genericService = Guid.NewGuid();
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            await db.GetService<IMigrator>().MigrateAsync("20261001113713_InitialMaintenance");
            // Deliberately use the foundation schema, never the current EF model before upgrade.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO "Bikes" ("Id","OwnerId","Name","Version") VALUES ({bike},{owner},'Legacy synthetic',1);
                INSERT INTO "Components" ("Id","OwnerId","Type","Model","Version") VALUES ({chainA},{owner},'Chain','Legacy A',1),({chainB},{owner},'Chain','Legacy B',1);
                INSERT INTO "Installations" ("Id","OwnerId","BikeId","ComponentId","Position","StartUtc","EndUtc","Version") VALUES
                ({installationA},{owner},{bike},{chainA},'Chain','2026-01-01Z','2026-01-02Z',1),
                ({installationB},{owner},{bike},{chainB},'Chain','2026-01-02Z',NULL,1);
                INSERT INTO "Rides" ("Id","OwnerId","BikeId","StartUtc","DistanceMetres","DurationSeconds","Version") VALUES
                ({rideA},{owner},{bike},'2026-01-01T01:00Z',65000,3600,1),({rideB},{owner},{bike},'2026-01-02T01:00Z',10000,NULL,1);
                INSERT INTO "MaintenanceRecords" ("Id","OwnerId","BikeId","ComponentId","Task","PerformedUtc","Notes","Cost","Currency","Version") VALUES
                ({service},{owner},{bike},{chainA},'Lubricate chain','2026-01-01T02:00Z','Legacy notes',12.50,'EUR',1),
                ({genericService},{owner},{bike},NULL,'Inspect brakes','2026-01-01T03:00Z',NULL,NULL,NULL,1);
                """
            );
            await db.Database.MigrateAsync();
        }
        await using var api = new ApiFactory(fixture.ConnectionString);
        _ = api.CreateClient();
        await ProjectionUpgrade.RebuildAllAsync(api.Services, default);
        await ProjectionUpgrade.RebuildAllAsync(api.Services, default);
        await using var upgraded = TestDatabase.Open(fixture.ConnectionString);
        var b = await upgraded.Bikes.SingleAsync();
        Assert.Equal(bike, b.Id);
        Assert.Equal("Legacy synthetic", b.Name);
        Assert.Null(b.Make);
        Assert.Null(b.Model);
        Assert.Null(b.Kind);
        Assert.Null(b.Year);
        Assert.All(await upgraded.Rides.ToListAsync(), r => Assert.Null(r.Name));
        Assert.Equal(
            new[] { rideA, rideB }.Order(),
            (await upgraded.Rides.Select(x => x.Id).ToListAsync()).Order()
        );
        Assert.All(
            await upgraded.Components.ToListAsync(),
            c => Assert.Equal(0, c.InitialUsageEstimateMetres)
        );
        Assert.Empty(await upgraded.ChainLubricationRules.ToListAsync());
        var m = await upgraded.MaintenanceRecords.SingleAsync(x => x.Id == service);
        var generic = await upgraded.MaintenanceRecords.SingleAsync(x => x.Id == genericService);
        Assert.Null(generic.TaskKey);
        Assert.Null(generic.Cost);
        Assert.Null(generic.Currency);
        Assert.Equal("Inspect brakes", generic.Task);
        Assert.Equal(service, m.Id);
        Assert.Equal("Lubricate chain", m.Task);
        Assert.Equal("chain-lubrication", m.TaskKey);
        Assert.Equal(12.50m, m.Cost);
        Assert.Equal("EUR", m.Currency);
        Assert.Equal("Legacy notes", m.Notes);
        Assert.Equal(
            65000,
            (
                await upgraded.ComponentUsages.SingleAsync(x => x.ComponentId == chainA)
            ).LifetimeMetres
        );
        Assert.Equal(
            10000,
            (
                await upgraded.ComponentUsages.SingleAsync(x => x.ComponentId == chainB)
            ).LifetimeMetres
        );
        Assert.Equal(2, await upgraded.Installations.CountAsync());
    }
}
