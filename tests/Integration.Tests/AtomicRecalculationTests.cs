using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
namespace BikeLog.Integration.Tests;

public class AtomicRecalculationTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private sealed class FailingCalculator : IUsageCalculator
    {
        public UsageCalculation Calculate(IReadOnlyList<Ride> rides, IReadOnlyList<Installation> installations) => throw new InvalidOperationException("Injected calculation failure");
    }
    [Fact]
    public async Task FailedRebuildRollsBackRideAndTotals()
    {
        var owner = Guid.NewGuid();
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            await db.Database.MigrateAsync();
            var bike = new Bike { OwnerId = owner, Name = "Synthetic" };
            var chain = new Component { OwnerId = owner, Model = "Chain" };
            db.AddRange(bike, chain, new Installation { OwnerId = owner, BikeId = bike.Id, ComponentId = chain.Id, StartUtc = DateTimeOffset.Parse("2026-01-01T00:00:00Z") });
            await db.SaveChangesAsync();
            var m = new OwnerMutation(db, new UsageRebuilder(db, new UsageCalculator()));
            await m.ExecuteAsync(owner, ct => { db.Add(new Ride { OwnerId = owner, BikeId = bike.Id, StartUtc = DateTimeOffset.Parse("2026-01-02T00:00:00Z"), DistanceMetres = 65000 }); return Task.FromResult(0); }, true, default);
        }
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            var mutation = new OwnerMutation(db, new UsageRebuilder(db, new FailingCalculator()));
            await Assert.ThrowsAsync<InvalidOperationException>(() => mutation.ExecuteAsync(owner, async ct => { var ride = await db.Rides.SingleAsync(x => x.OwnerId == owner, ct); ride.DistanceMetres = 10000; return 0; }, true, default));
        }
        await using (var db = TestDatabase.Open(fixture.ConnectionString))
        {
            Assert.Equal(65000, (await db.Rides.SingleAsync(x => x.OwnerId == owner)).DistanceMetres);
            Assert.Equal(65000, (await db.ComponentUsages.SingleAsync(x => x.OwnerId == owner)).LifetimeMetres);
        }
    }
    [Fact]
    public async Task ConcurrentOwnerMutationsSerialize()
    {
        var owner = Guid.NewGuid();
        await using var a = TestDatabase.Open(fixture.ConnectionString);
        await a.Database.MigrateAsync();
        var bike = new Bike { OwnerId = owner, Name = "Before" };
        a.Add(bike);
        await a.SaveChangesAsync();
        a.ChangeTracker.Clear();
        await using var b = TestDatabase.Open(fixture.ConnectionString);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = new OwnerMutation(a, new UsageRebuilder(a, new UsageCalculator())).ExecuteAsync(owner, async ct => { var row = await a.Bikes.SingleAsync(x => x.Id == bike.Id, ct); row.Name = "After"; entered.SetResult(); await release.Task.WaitAsync(TimeSpan.FromSeconds(5)); return 0; }, false, default);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = new OwnerMutation(b, new UsageRebuilder(b, new UsageCalculator())).ExecuteAsync(owner, async ct => (await b.Bikes.SingleAsync(x => x.Id == bike.Id, ct)).Name, false, default);
        try
        {
            await Assert.ThrowsAsync<TimeoutException>(() => second.WaitAsync(TimeSpan.FromMilliseconds(150)));
        }
        finally { release.TrySetResult(); }
        await first;
        Assert.Equal("After", await second);
    }
}
