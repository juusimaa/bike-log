using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Api.Development;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BikeLog.Integration.Tests;

public class BikeLifecycleUpgradeTests
{
    [Fact]
    public async Task ExistingBikesBecomeActiveWithIdenticalTotals()
    {
        await using var fixture = new PostgresFixture();
        await fixture.InitializeAsync();
        var owner = ApiScenario.Owner;
        Guid road = Guid.NewGuid(),
            gravel = Guid.NewGuid(),
            chainA = Guid.NewGuid(),
            chainB = Guid.NewGuid(),
            saddle = Guid.NewGuid();
        Snapshot before;
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            await db.GetService<IMigrator>().MigrateAsync("20261013073652_ComponentGroupsWeight");
            // Deliberately use the pre-feature schema, never the current EF model before upgrade.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO "Bikes" ("Id","OwnerId","Name","Make","Model","Kind","Year","Version") VALUES
                ({road},{owner},NULL,'Synthetic','Road','Road',2026,3),
                ({gravel},{owner},'Synthetic gravel','Synthetic','Gravel','Gravel',2025,1);
                INSERT INTO "Components" ("Id","OwnerId","Type","Make","Model","Version","InitialUsageEstimateMetres") VALUES
                ({chainA},{owner},'Chain','Synthetic','Chain A',1,500),
                ({chainB},{owner},'Chain','Synthetic','Chain B',1,0),
                ({saddle},{owner},'Saddle','Synthetic','Saddle',1,0);
                INSERT INTO "Installations" ("Id","OwnerId","BikeId","ComponentId","Position","StartUtc","EndUtc","Version") VALUES
                ({Guid.NewGuid()},{owner},{road},{chainA},'Chain','2026-01-01Z','2026-02-01Z',2),
                ({Guid.NewGuid()},{owner},{gravel},{chainA},'Chain','2026-02-01Z',NULL,1),
                ({Guid.NewGuid()},{owner},{road},{chainB},'Chain','2026-02-01Z',NULL,1),
                ({Guid.NewGuid()},{owner},{road},{saddle},'Saddle','2026-01-01Z',NULL,1);
                INSERT INTO "Rides" ("Id","OwnerId","BikeId","StartUtc","DistanceMetres","DurationSeconds","Version") VALUES
                ({Guid.NewGuid()},{owner},{road},'2026-01-10T08:00Z',50000,3600,1),
                ({Guid.NewGuid()},{owner},{road},'2026-02-10T08:00Z',30000,NULL,1),
                ({Guid.NewGuid()},{owner},{gravel},'2026-02-12T08:00Z',70000,7200,1);
                """
            );
            // Usage tables and the rows the rebuild reads are unchanged by this feature.
            await new UsageRebuilder(db, new UsageCalculator()).RebuildAsync(
                owner,
                CancellationToken.None
            );
            before = await Totals(db);
            await db.Database.MigrateAsync();
        }

        await using var api = new ApiFactory(fixture.ConnectionString);
        await ProjectionUpgrade.RebuildAllAsync(api.Services, default);
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            Assert.Equal(before, await Totals(db));
            Assert.Equal(80000, before.Bikes[road]);
            Assert.Equal(70000, before.Bikes[gravel]);
            Assert.Equal(120000, before.Components[chainA]);
            var bikes = await db.Bikes.IgnoreQueryFilters().AsNoTracking().ToListAsync();
            Assert.Equal(2, bikes.Count);
            Assert.All(bikes, b => Assert.Equal(BikeStatus.Active, b.Status));
            Assert.All(bikes, b => Assert.Null(b.DeletedUtc));
            Assert.Equal(3, bikes.Single(x => x.Id == road).Version);
        }

        var client = api.CreateClient();
        var listed = await client.GetFromJsonAsync<JsonElement>("/api/bikes");
        Assert.All(
            listed.GetProperty("items").EnumerateArray(),
            x => Assert.Equal("active", x.GetProperty("status").GetString())
        );
        Assert.Equal(2, listed.GetProperty("items").GetArrayLength());
    }

    private sealed record Snapshot(
        Dictionary<Guid, long> Bikes,
        Dictionary<Guid, long> Components,
        Dictionary<Guid, long> Installations
    )
    {
        public bool Equals(Snapshot? other) =>
            other is not null
            && Same(Bikes, other.Bikes)
            && Same(Components, other.Components)
            && Same(Installations, other.Installations);

        private static bool Same(Dictionary<Guid, long> a, Dictionary<Guid, long> b) =>
            a.OrderBy(x => x.Key).SequenceEqual(b.OrderBy(x => x.Key));

        public override int GetHashCode() => Components.Count;
    }

    private static async Task<Snapshot> Totals(BikeLogDbContext db) =>
        new(
            await db
                .Rides.AsNoTracking()
                .GroupBy(x => x.BikeId)
                .ToDictionaryAsync(x => x.Key, x => x.Sum(r => r.DistanceMetres)),
            await db
                .ComponentUsages.AsNoTracking()
                .ToDictionaryAsync(x => x.ComponentId, x => x.LifetimeMetres),
            await db
                .InstallationUsages.AsNoTracking()
                .ToDictionaryAsync(x => x.InstallationId, x => x.Metres)
        );
}
