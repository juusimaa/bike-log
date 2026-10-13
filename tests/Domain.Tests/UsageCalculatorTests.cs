using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;

namespace BikeLog.Domain.Tests;

public class UsageCalculatorTests
{
    private static readonly Guid Owner = Guid.NewGuid(),
        Bike = Guid.NewGuid();
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

    private static Installation Install(DateTimeOffset? start = null) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            ComponentId = Guid.NewGuid(),
            StartUtc = start ?? Start,
        };

    private static Ride Ride(
        DateTimeOffset? start = null,
        long distance = 65000,
        long? seconds = 3600
    ) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            StartUtc = start ?? Start,
            DistanceMetres = distance,
            DurationSeconds = seconds,
        };

    [Fact]
    public void RideAtStartAllocates65000Metres()
    {
        var r = new UsageCalculator().Calculate([Ride()], [Install()]);
        Assert.Equal(65000, r.ComponentUsages.Single().LifetimeMetres);
        Assert.Equal(3600, r.InstallationUsages.Single().Seconds);
    }

    [Fact]
    public void RideBeforeStartIsUnallocated()
    {
        var ride = Ride(Start.AddTicks(-10));
        var r = new UsageCalculator().Calculate([ride], [Install()]);
        Assert.Contains(ride.Id, r.UnallocatedRideIds);
        Assert.Equal(0, r.ComponentUsages.Single().LifetimeMetres);
    }

    [Fact]
    public void ReplacementBoundaryIsHalfOpen()
    {
        var a = Install();
        a.EndUtc = Start.AddDays(1);
        var b = Install(a.EndUtc);
        var r = new UsageCalculator().Calculate(
            [Ride(a.EndUtc), Ride(a.EndUtc.Value.AddTicks(-10), 10000)],
            [a, b]
        );
        Assert.Equal(
            10000,
            r.ComponentUsages.Single(x => x.ComponentId == a.ComponentId).LifetimeMetres
        );
        Assert.Equal(
            65000,
            r.ComponentUsages.Single(x => x.ComponentId == b.ComponentId).LifetimeMetres
        );
    }

    [Fact]
    public void MaintenanceDoesNotChangeUsage()
    {
        var calc = new UsageCalculator();
        var i = Install();
        var ride = Ride();
        var before = calc.Calculate([ride], [i]);
        _ = new BikeLog.Domain.Maintenance.MaintenanceRecord { Task = "lubrication" };
        Assert.Equal(before.ComponentUsages, calc.Calculate([ride], [i]).ComponentUsages);
    }

    [Fact]
    public void MissingDurationIsFlagged()
    {
        var r = new UsageCalculator().Calculate([Ride(seconds: null)], [Install()]);
        Assert.True(r.ComponentUsages.Single().HasUnknownDuration);
        Assert.Equal(0, r.ComponentUsages.Single().LifetimeSeconds);
    }

    [Fact]
    public void OffsetInstantMatchesUtcInstant()
    {
        var r = new UsageCalculator().Calculate(
            [Ride(DateTimeOffset.Parse("2026-01-01T02:00:00+02:00"))],
            [Install()]
        );
        Assert.Equal(65000, r.ComponentUsages.Single().LifetimeMetres);
    }

    [Fact]
    public void OverflowFailsRatherThanWraps()
    {
        Assert.Throws<OverflowException>(() =>
            new UsageCalculator().Calculate(
                [Ride(distance: long.MaxValue), Ride(distance: 1)],
                [Install()]
            )
        );
    }

    [Theory]
    [InlineData(0, null)]
    [InlineData(-1, 10L)]
    [InlineData(1, 0L)]
    [InlineData(1, -1L)]
    public void InvalidQuantities(long metres, long? seconds)
    {
        Assert.Throws<DomainValidationException>(() =>
            new UsageCalculator().Calculate([Ride(distance: metres, seconds: seconds)], [Install()])
        );
    }

    [Fact]
    public void OrderAndRepetitionDoNotChangeTotals()
    {
        var i = Install();
        var a = Ride();
        var b = Ride(distance: 10000);
        var c = new UsageCalculator();
        Assert.Equal(
            c.Calculate([a, b], [i]).ComponentUsages,
            c.Calculate([b, a], [i]).ComponentUsages
        );
        Assert.Equal(
            c.Calculate([a, b], [i]).ComponentUsages,
            c.Calculate([a, b], [i]).ComponentUsages
        );
    }

    [Fact]
    public void OtherOwnerRideDoesNotAllocate()
    {
        var ride = Ride();
        ride.OwnerId = Guid.NewGuid();
        Assert.Contains(
            ride.Id,
            new UsageCalculator().Calculate([ride], [Install()]).UnallocatedRideIds
        );
    }

    private static Installation Fit(InstallationPosition position)
    {
        var i = Install();
        i.Position = position;
        return i;
    }

    private static PositionExemption NoneFitted(DateTimeOffset start, DateTimeOffset? end = null) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            Position = InstallationPosition.FrontDerailleur,
            Reason = ExemptionReason.NoneFitted,
            StartUtc = start,
            EndUtc = end,
        };

    [Fact]
    public void RideAllocatesToAFittedSaddle()
    {
        var saddle = Fit(InstallationPosition.Saddle);
        var r = new UsageCalculator().Calculate([Ride(distance: 40000)], [saddle]);
        Assert.Equal(40000, r.ComponentUsages.Single().LifetimeMetres);
        Assert.DoesNotContain(r.AllocationGaps, x => x.Position == InstallationPosition.Saddle);
    }

    [Fact]
    public void ExemptPositionHasNoGapButUnrecordedPositionsStillDo()
    {
        var inside = Ride(Start.AddHours(1));
        var after = Ride(Start.AddDays(2));
        var r = new UsageCalculator().Calculate(
            [inside, after],
            [],
            [NoneFitted(Start, Start.AddDays(1))]
        );
        Assert.DoesNotContain(
            r.AllocationGaps,
            x => x.RideId == inside.Id && x.Position == InstallationPosition.FrontDerailleur
        );
        Assert.Contains(
            r.AllocationGaps,
            x => x.RideId == after.Id && x.Position == InstallationPosition.FrontDerailleur
        );
        Assert.Contains(
            r.AllocationGaps,
            x => x.RideId == inside.Id && x.Position == InstallationPosition.Saddle
        );
    }

    [Fact]
    public void PositionGapsSummariseEachGappedPosition()
    {
        var first = Ride(Start.AddDays(1));
        var last = Ride(Start.AddDays(5));
        var middle = Ride(Start.AddDays(3));
        var r = new UsageCalculator().Calculate(
            [last, first, middle],
            [Fit(InstallationPosition.Chain)]
        );
        Assert.DoesNotContain(r.PositionGaps, x => x.Position == InstallationPosition.Chain);
        Assert.Equal(26, r.PositionGaps.Count);
        var saddle = r.PositionGaps.Single(x => x.Position == InstallationPosition.Saddle);
        Assert.Equal(
            new PositionGap(Bike, InstallationPosition.Saddle, 3, first.StartUtc, last.StartUtc),
            saddle
        );
        Assert.Equal(InstallationPosition.Fork, r.PositionGaps[0].Position);
    }
}
