using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;

namespace BikeLog.Domain.Tests;

public class MultiComponentUsageTests
{
    private static readonly Guid Owner = Guid.NewGuid(),
        Bike = Guid.NewGuid();
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

    private static Installation Part(int position) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            ComponentId = Guid.NewGuid(),
            Position = (InstallationPosition)position,
            StartUtc = Start,
        };

    private static Ride Ride(
        DateTimeOffset? at = null,
        long metres = 65000,
        long? seconds = 3600
    ) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            StartUtc = at ?? Start,
            DistanceMetres = metres,
            DurationSeconds = seconds,
        };

    [Fact]
    public void RideAllocatesToAllFourParts()
    {
        var result = new UsageCalculator().Calculate(
            [Ride()],
            [Part(0), Part(1), Part(2), Part(3)]
        );
        Assert.Equal(4, result.ComponentUsages.Count);
        Assert.All(
            result.ComponentUsages,
            x =>
            {
                Assert.Equal(65000, x.LifetimeMetres);
                Assert.Equal(3600, x.LifetimeSeconds);
                Assert.False(x.HasUnknownDuration);
            }
        );
        Assert.All(result.InstallationUsages, x => Assert.Equal(65000, x.Metres));
    }

    [Fact]
    public void MissingChainDoesNotSuppressTyres()
    {
        var ride = Ride(seconds: null);
        var result = new UsageCalculator().Calculate([ride], [Part(2), Part(3)]);
        Assert.All(
            result.ComponentUsages,
            x =>
            {
                Assert.Equal(65000, x.LifetimeMetres);
                Assert.True(x.HasUnknownDuration);
                Assert.Equal(0, x.LifetimeSeconds);
            }
        );
        Assert.Contains(ride.Id, result.UnallocatedRideIds);
        Assert.Contains(
            result.AllocationGaps,
            x => x.RideId == ride.Id && x.Position == InstallationPosition.Chain
        );
        Assert.Equal(2, result.AllocationGaps.Count);
    }

    [Fact]
    public void DifferentPositionsMayOverlap() =>
        InstallationRules.Validate([Part(0), Part(1), Part(2), Part(3)]);

    [Fact]
    public void ComponentCannotOverlapAcrossBikes()
    {
        var first = Part(2);
        var next = Part(3);
        next.ComponentId = first.ComponentId;
        next.BikeId = Guid.NewGuid();
        Assert.Throws<DomainValidationException>(() => InstallationRules.Validate([first, next]));
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void TyreFitsEitherTyrePosition(int position) =>
        ComponentCompatibility.Validate(ComponentType.Tyre, (InstallationPosition)position);

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void BoundaryUsesReplacementPart(int position)
    {
        var old = Part(position);
        old.EndUtc = Start.AddDays(1);
        var next = Part(position);
        next.StartUtc = old.EndUtc.Value;
        var result = new UsageCalculator().Calculate(
            [Ride(next.StartUtc.AddTicks(-10), 10000), Ride(next.StartUtc)],
            [old, next]
        );
        Assert.Equal(
            10000,
            result.ComponentUsages.Single(x => x.ComponentId == old.ComponentId).LifetimeMetres
        );
        Assert.Equal(
            65000,
            result.ComponentUsages.Single(x => x.ComponentId == next.ComponentId).LifetimeMetres
        );
    }

    [Fact]
    public void OtherOwnerDoesNotAllocateAnyPosition()
    {
        var ride = Ride();
        ride.OwnerId = Guid.NewGuid();
        var result = new UsageCalculator().Calculate([ride], [Part(0), Part(1), Part(2), Part(3)]);
        Assert.All(result.ComponentUsages, x => Assert.Equal(0, x.LifetimeMetres));
        Assert.Equal(4, result.AllocationGaps.Count);
    }
}
