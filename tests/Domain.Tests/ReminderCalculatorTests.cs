using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Reminders;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;

namespace BikeLog.Domain.Tests;

public class ReminderCalculatorTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-02T12:00:00Z");
    private readonly Guid owner = Guid.NewGuid(),
        bike = Guid.NewGuid();

    private Installation Chain() =>
        new()
        {
            OwnerId = owner,
            BikeId = bike,
            ComponentId = Guid.NewGuid(),
            StartUtc = Now.AddDays(-10),
        };

    private ChainLubricationRule Rule() =>
        new()
        {
            OwnerId = owner,
            BikeId = bike,
            Enabled = true,
            Method = LubricationMethod.Oil,
            OilThresholdMetres = 150000,
            WaxThresholdMetres = 300000,
        };

    private Ride Ride(long metres, DateTimeOffset? at = null) =>
        new()
        {
            OwnerId = owner,
            BikeId = bike,
            DistanceMetres = metres,
            StartUtc = at ?? Now,
        };

    private MaintenanceRecord Service(
        Installation i,
        DateTimeOffset at,
        string? key = "chain-lubrication"
    ) =>
        new()
        {
            OwnerId = owner,
            BikeId = bike,
            ComponentId = i.ComponentId,
            PerformedUtc = at,
            Task = "Service",
            TaskKey = key,
        };

    private static ReminderEvaluation Read(
        ChainLubricationRule? rule,
        Installation? chain,
        IReadOnlyList<Ride> rides,
        params MaintenanceRecord[] services
    ) => new ReminderCalculator().Calculate(rule, chain, rides, services, Now);

    [Theory]
    [InlineData(149000, false, 1000)]
    [InlineData(150000, true, 0)]
    public void OilThresholdBoundary(long distance, bool due, long remaining)
    {
        var i = Chain();
        var r = Read(Rule(), i, [Ride(distance)]);
        Assert.Equal(due, r.Due);
        Assert.Equal(remaining, r.RemainingMetres);
        Assert.Equal(i.StartUtc, r.BaselineUtc);
        Assert.Equal("installation", r.BaselineKind);
    }

    [Fact]
    public void WaxSwitchKeepsBaselineAndOilInterval()
    {
        var rule = Rule();
        var i = Chain();
        var rides = new[] { Ride(160000) };
        var oil = Read(rule, i, rides);
        Assert.True(oil.Due);
        rule.Method = LubricationMethod.Wax;
        var wax = Read(rule, i, rides);
        Assert.False(wax.Due);
        Assert.Equal(140000, wax.RemainingMetres);
        rule.WaxThresholdMetres = 200000;
        Assert.Equal(40000, Read(rule, i, rides).RemainingMetres);
        rule.Method = LubricationMethod.Oil;
        var back = Read(rule, i, rides);
        Assert.True(back.Due);
        Assert.Equal(150000, back.OilThresholdMetres);
        Assert.Equal(oil.BaselineUtc, back.BaselineUtc);
    }

    [Fact]
    public void LubricationResetsOnlyReminderBaseline()
    {
        var i = Chain();
        var at = Now.AddDays(-1);
        var rides = new[] { Ride(160000, at.AddDays(-1)), Ride(10000) };
        var before = new UsageCalculator().Calculate(rides, [i]);
        var r = Read(Rule(), i, rides, Service(i, at));
        Assert.Equal(at, r.BaselineUtc);
        Assert.Equal("lubrication", r.BaselineKind);
        Assert.Equal(10000, r.DistanceSinceBaselineMetres);
        Assert.Equal(
            170000,
            new UsageCalculator().Calculate(rides, [i]).ComponentUsages.Single().LifetimeMetres
        );
        Assert.Equal(
            before.ComponentUsages,
            new UsageCalculator().Calculate(rides, [i]).ComponentUsages
        );
    }

    [Fact]
    public void BackdatedAndFutureServiceUseCorrectBaseline()
    {
        var i = Chain();
        var latest = Service(i, Now.AddDays(-1));
        var otherBike = Service(i, Now);
        otherBike.BikeId = Guid.NewGuid();
        var otherOwner = Service(i, Now);
        otherOwner.OwnerId = Guid.NewGuid();
        var otherPart = Service(i, Now);
        otherPart.ComponentId = Guid.NewGuid();
        var r = Read(
            Rule(),
            i,
            [Ride(10000), Ride(900000, Now.AddSeconds(1))],
            Service(i, i.StartUtc.AddDays(-1)),
            latest,
            Service(i, Now.AddDays(-2)),
            Service(i, Now.AddSeconds(1)),
            otherBike,
            otherOwner,
            otherPart
        );
        Assert.Equal(latest.PerformedUtc, r.BaselineUtc);
        Assert.Equal(10000, r.DistanceSinceBaselineMetres);
    }

    [Fact]
    public void ReplacementKeepsSettingsButStartsFreshBaseline()
    {
        var old = Chain();
        old.EndUtc = Now.AddDays(-1);
        var replacement = Chain();
        replacement.StartUtc = old.EndUtc.Value;
        var rule = Rule();
        var r = Read(
            rule,
            replacement,
            [Ride(160000, old.StartUtc), Ride(10000)],
            Service(old, Now.AddDays(-2))
        );
        Assert.Equal(replacement.StartUtc, r.BaselineUtc);
        Assert.Equal(10000, r.DistanceSinceBaselineMetres);
        Assert.Equal(150000, r.ActiveThresholdMetres);
        Assert.Equal(300000, r.WaxThresholdMetres);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void RideAtBaselineIsIncluded(bool lubrication)
    {
        var i = Chain();
        var at = lubrication ? Now : i.StartUtc;
        var r = Read(
            Rule(),
            i,
            [Ride(10000, at), Ride(500, at.AddTicks(-10))],
            lubrication ? [Service(i, at)] : []
        );
        Assert.Equal(at, r.BaselineUtc);
        Assert.Equal(10000, r.DistanceSinceBaselineMetres);
    }

    [Fact]
    public void RecordedDistanceBelowThresholdIsNotDue()
    {
        var i = Chain();
        var r = Read(Rule(), i, [Ride(10000)]);
        Assert.Equal(10000, r.DistanceSinceBaselineMetres);
        Assert.False(r.Due);
    }

    [Fact]
    public void DisabledAndNoChainStatesAreExplicit()
    {
        var absent = Read(null, Chain(), []);
        Assert.Equal(0, absent.RuleVersion);
        Assert.Equal("disabled", absent.State);
        Assert.Null(absent.Method);
        Assert.Null(absent.Due);
        Assert.Null(absent.DistanceSinceBaselineMetres);
        var rule = Rule();
        rule.Enabled = false;
        rule.Method = null;
        var disabled = Read(rule, Chain(), []);
        Assert.Equal("disabled", disabled.State);
        Assert.Equal(150000, disabled.OilThresholdMetres);
        Assert.Null(disabled.BaselineUtc);
        rule = Rule();
        var missing = Read(rule, null, []);
        Assert.Equal("no-current-chain", missing.State);
        Assert.Null(missing.Due);
        Assert.Null(missing.ActiveThresholdMetres);
        var future = Chain();
        future.StartUtc = Now.AddSeconds(1);
        Assert.Equal("no-current-chain", Read(rule, future, []).State);
        var ended = Chain();
        ended.EndUtc = Now;
        Assert.Equal("no-current-chain", Read(rule, ended, []).State);
        var wrong = Chain();
        wrong.OwnerId = Guid.NewGuid();
        Assert.Equal("no-current-chain", Read(rule, wrong, []).State);
        rule.Method = null;
        Assert.Equal("disabled", Read(rule, Chain(), []).State);
    }

    [Fact]
    public void GeneralInspectionDoesNotReset()
    {
        var i = Chain();
        var generic = Service(i, Now, null);
        generic.Task = "Lubricate chain";
        var r = Read(Rule(), i, [Ride(160000)], generic, Service(i, Now, "inspection"));
        Assert.Equal(i.StartUtc, r.BaselineUtc);
        Assert.True(r.Due);
    }

    [Fact]
    public void ForeignAndPreInstallationRidesDoNotCount()
    {
        var i = Chain();
        var foreign = Ride(500000);
        foreign.OwnerId = Guid.NewGuid();
        var other = Ride(500000);
        other.BikeId = Guid.NewGuid();
        var r = Read(
            Rule(),
            i,
            [foreign, other, Ride(500000, i.StartUtc.AddTicks(-10)), Ride(10000)]
        );
        Assert.Equal(10000, r.DistanceSinceBaselineMetres);
    }

    [Fact]
    public void OverflowIsChecked()
    {
        Assert.Throws<OverflowException>(() =>
            Read(Rule(), Chain(), [Ride(long.MaxValue), Ride(1)])
        );
    }
}
