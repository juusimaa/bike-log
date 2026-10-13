using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Api.Development;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BikeLog.Integration.Tests;

public class ComponentGroupsUpgradeTests
{
    [Fact]
    public async Task ExistingPartsKeepTotalsAndGainGroupsAfterUpgrade()
    {
        await using var fixture = new PostgresFixture();
        await fixture.InitializeAsync();
        var owner = ApiScenario.Owner;
        var bike = Guid.NewGuid();
        Guid chain = Guid.NewGuid(),
            cassette = Guid.NewGuid(),
            front = Guid.NewGuid(),
            rearOld = Guid.NewGuid(),
            rearNew = Guid.NewGuid();
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            await db.GetService<IMigrator>()
                .MigrateAsync("20261009051928_AddAuthenticationOwnership");
            // Deliberately use the pre-feature schema, never the current EF model before upgrade.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO "Bikes" ("Id","OwnerId","Name","Version") VALUES ({bike},{owner},'Legacy synthetic',1);
                INSERT INTO "Components" ("Id","OwnerId","Type","Make","Model","Version","InitialUsageEstimateMetres") VALUES
                ({chain},{owner},'Chain','Synthetic','Chain',1,1000),
                ({cassette},{owner},'Cassette','Synthetic','Cassette',1,0),
                ({front},{owner},'Tyre','Synthetic','Front',1,0),
                ({rearOld},{owner},'Tyre','Synthetic','Rear old',1,0),
                ({rearNew},{owner},'Tyre','Synthetic','Rear new',1,0);
                INSERT INTO "Installations" ("Id","OwnerId","BikeId","ComponentId","Position","StartUtc","EndUtc","Version") VALUES
                ({Guid.NewGuid()},{owner},{bike},{chain},'Chain','2026-01-01Z',NULL,1),
                ({Guid.NewGuid()},{owner},{bike},{cassette},'Cassette','2026-01-01Z',NULL,1),
                ({Guid.NewGuid()},{owner},{bike},{front},'FrontTyre','2026-01-01Z',NULL,1),
                ({Guid.NewGuid()},{owner},{bike},{rearOld},'RearTyre','2026-01-01Z','2026-01-05Z',2),
                ({Guid.NewGuid()},{owner},{bike},{rearNew},'RearTyre','2026-01-05Z',NULL,1);
                INSERT INTO "Rides" ("Id","OwnerId","BikeId","StartUtc","DistanceMetres","DurationSeconds","Version") VALUES
                ({Guid.NewGuid()},{owner},{bike},'2026-01-02T08:00Z',65000,3600,1),
                ({Guid.NewGuid()},{owner},{bike},'2026-01-06T08:00Z',40000,NULL,1);
                INSERT INTO "MaintenanceRecords" ("Id","OwnerId","BikeId","ComponentId","Task","PerformedUtc","Version") VALUES
                ({Guid.NewGuid()},{owner},{bike},{rearNew},'Replace rear tyre','2026-01-05Z',1);
                """
            );
            await db.Database.MigrateAsync();
        }
        await using var api = new ApiFactory(fixture.ConnectionString);
        var client = api.CreateClient();
        await ProjectionUpgrade.RebuildAllAsync(api.Services, default);
        var upgraded = await Totals(fixture.ConnectionString);
        // Foundation-era allocation: whole rides by start instant, half-open installations.
        Assert.Equal(105000, upgraded.Components[chain]);
        Assert.Equal(105000, upgraded.Components[cassette]);
        Assert.Equal(105000, upgraded.Components[front]);
        Assert.Equal(65000, upgraded.Components[rearOld]);
        Assert.Equal(40000, upgraded.Components[rearNew]);
        Assert.Equal(
            new long[] { 40000, 65000, 105000, 105000, 105000 },
            upgraded.Installations.Values.Order().ToArray()
        );
        await ProjectionUpgrade.RebuildAllAsync(api.Services, default);
        Assert.Equal(upgraded, await Totals(fixture.ConnectionString));
        Assert.Equal(
            106000,
            (await client.GetFromJsonAsync<JsonElement>($"/api/components/{chain}/usage"))
                .GetProperty("combinedLifetimeMetres")
                .GetInt64()
        );

        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            Assert.All(await db.Components.ToListAsync(), c => Assert.Null(c.WeightGrams));
            Assert.Equal("Replace rear tyre", (await db.MaintenanceRecords.SingleAsync()).Task);
        }
        foreach (
            var (id, group) in new[]
            {
                (chain, "groupset"),
                (cassette, "groupset"),
                (front, "wheels"),
                (rearNew, "wheels"),
            }
        )
        {
            var body = await client.GetFromJsonAsync<JsonElement>($"/api/components/{id}");
            Assert.Equal(group, body.GetProperty("group").GetString());
            Assert.Equal(JsonValueKind.Null, body.GetProperty("weightGrams").ValueKind);
        }
    }

    private sealed record Snapshot(
        Dictionary<Guid, long> Components,
        Dictionary<Guid, long> Installations
    )
    {
        public bool Equals(Snapshot? other) =>
            other is not null
            && Components.OrderBy(x => x.Key).SequenceEqual(other.Components.OrderBy(x => x.Key))
            && Installations
                .OrderBy(x => x.Key)
                .SequenceEqual(other.Installations.OrderBy(x => x.Key));

        public override int GetHashCode() => Components.Count;
    }

    private static async Task<Snapshot> Totals(string connection)
    {
        await using var db = TestDatabase.Open(connection);
        return new(
            await db
                .ComponentUsages.AsNoTracking()
                .ToDictionaryAsync(x => x.ComponentId, x => x.LifetimeMetres),
            await db
                .InstallationUsages.AsNoTracking()
                .ToDictionaryAsync(x => x.InstallationId, x => x.Metres)
        );
    }
}
