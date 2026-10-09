using BikeLog.Api.Operations;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Reminders;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BikeLog.Integration.Tests;

public class SyntheticOwnerPurgeTests
{
    private static readonly Guid Synthetic = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task PurgeRequiresConfirmationAndPreservesOtherOwnersAndMigrationHistory()
    {
        var database = new PostgresFixture();
        await database.InitializeAsync();
        try
        {
            await using var db = TestDatabase.Open(database.ConnectionString);
            await db.Database.MigrateAsync();
            var otherOwner = Guid.NewGuid();
            var syntheticBike = new Bike { OwnerId = Synthetic, Name = "Delete only this" };
            var otherBike = new Bike { OwnerId = otherOwner, Name = "Keep this" };
            var syntheticComponent = new Component { OwnerId = Synthetic, Model = "Delete" };
            var otherComponent = new Component { OwnerId = otherOwner, Model = "Keep" };
            var rows = new object[]
            {
                syntheticBike,
                otherBike,
                syntheticComponent,
                otherComponent,
                new Installation
                {
                    OwnerId = Synthetic,
                    BikeId = syntheticBike.Id,
                    ComponentId = syntheticComponent.Id,
                    StartUtc = ApiScenario.Start,
                },
                new Installation
                {
                    OwnerId = otherOwner,
                    BikeId = otherBike.Id,
                    ComponentId = otherComponent.Id,
                    StartUtc = ApiScenario.Start,
                },
                new Ride
                {
                    OwnerId = Synthetic,
                    BikeId = syntheticBike.Id,
                    StartUtc = ApiScenario.Start,
                    DistanceMetres = 1000,
                },
                new Ride
                {
                    OwnerId = otherOwner,
                    BikeId = otherBike.Id,
                    StartUtc = ApiScenario.Start,
                    DistanceMetres = 1000,
                },
                new MaintenanceRecord
                {
                    OwnerId = Synthetic,
                    BikeId = syntheticBike.Id,
                    Task = "clean",
                    PerformedUtc = ApiScenario.Start,
                },
                new MaintenanceRecord
                {
                    OwnerId = otherOwner,
                    BikeId = otherBike.Id,
                    Task = "clean",
                    PerformedUtc = ApiScenario.Start,
                },
                new ChainLubricationRule { OwnerId = Synthetic, BikeId = syntheticBike.Id },
                new ChainLubricationRule { OwnerId = otherOwner, BikeId = otherBike.Id },
            };
            db.AddRange(rows);
            await db.SaveChangesAsync();
            var rebuilder = new UsageRebuilder(db, new UsageCalculator());
            await rebuilder.RebuildAsync(Synthetic, CancellationToken.None);
            await rebuilder.RebuildAsync(otherOwner, CancellationToken.None);
            var history = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["AccessMode"] = "Synthetic",
                        ["LocalSyntheticMode"] = "true",
                        ["ConnectionStrings:Postgres"] = database.ConnectionString,
                    }
                )
                .Build();

            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                SyntheticOwnerPurge.PurgeAsync(
                    db,
                    configuration,
                    "Development",
                    Synthetic,
                    false,
                    CancellationToken.None
                )
            );
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                SyntheticOwnerPurge.PurgeAsync(
                    db,
                    configuration,
                    "Development",
                    otherOwner,
                    true,
                    CancellationToken.None
                )
            );
            var wrongMode = new ConfigurationBuilder()
                .AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["AccessMode"] = "Authenticated",
                        ["LocalSyntheticMode"] = "false",
                        ["ConnectionStrings:Postgres"] = database.ConnectionString,
                    }
                )
                .Build();
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                SyntheticOwnerPurge.PurgeAsync(
                    db,
                    wrongMode,
                    "Development",
                    Synthetic,
                    true,
                    CancellationToken.None
                )
            );
            var wrongDatabase = new ConfigurationBuilder()
                .AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["AccessMode"] = "Synthetic",
                        ["LocalSyntheticMode"] = "true",
                        ["ConnectionStrings:Postgres"] =
                            "Host=127.0.0.1;Port=54329;Database=bikelog_prod;Username=unused;Password=unused",
                    }
                )
                .Build();
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                SyntheticOwnerPurge.PurgeAsync(
                    db,
                    wrongDatabase,
                    "Development",
                    Synthetic,
                    true,
                    CancellationToken.None
                )
            );
            Assert.Equal(2, await db.Bikes.CountAsync());

            await SyntheticOwnerPurge.PurgeAsync(
                db,
                configuration,
                "Development",
                Synthetic,
                true,
                CancellationToken.None
            );
            Assert.False(await db.Bikes.AnyAsync(x => x.Id == syntheticBike.Id));
            Assert.True(await db.Bikes.AnyAsync(x => x.Id == otherBike.Id));
            Assert.False(await db.Components.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.False(await db.Installations.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.False(await db.Rides.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.False(await db.MaintenanceRecords.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.False(await db.ChainLubricationRules.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.False(await db.ComponentUsages.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.False(await db.InstallationUsages.AnyAsync(x => x.OwnerId == Synthetic));
            Assert.True(await db.ComponentUsages.AnyAsync(x => x.OwnerId == otherOwner));
            Assert.True(await db.InstallationUsages.AnyAsync(x => x.OwnerId == otherOwner));
            await SyntheticOwnerPurge.PurgeAsync(
                db,
                configuration,
                "Development",
                Synthetic,
                true,
                CancellationToken.None
            );
            Assert.Equal(history, (await db.Database.GetAppliedMigrationsAsync()).ToArray());
        }
        finally
        {
            await database.DisposeAsync();
        }
    }
}
