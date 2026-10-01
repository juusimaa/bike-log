using BikeLog.Domain.Installations;

namespace BikeLog.Domain.Tests;

public class InstallationRulesTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void OverlappingComponentAndPositionAreRejected(bool sameComponent)
    {
        var a = new Installation
        {
            OwnerId = Guid.NewGuid(),
            BikeId = Guid.NewGuid(),
            ComponentId = Guid.NewGuid(),
            StartUtc = Start,
        };
        var b = new Installation
        {
            OwnerId = a.OwnerId,
            BikeId = sameComponent ? Guid.NewGuid() : a.BikeId,
            ComponentId = sameComponent ? a.ComponentId : Guid.NewGuid(),
            StartUtc = Start.AddDays(1),
        };
        Assert.Throws<DomainValidationException>(() => InstallationRules.Validate([a, b]));
    }

    [Fact]
    public void AdjacentIntervalsAreAllowed()
    {
        var a = new Installation
        {
            BikeId = Guid.NewGuid(),
            ComponentId = Guid.NewGuid(),
            StartUtc = Start,
            EndUtc = Start.AddDays(1),
        };
        var b = new Installation
        {
            BikeId = a.BikeId,
            ComponentId = Guid.NewGuid(),
            StartUtc = a.EndUtc.Value,
        };
        InstallationRules.Validate([a, b]);
    }

    [Fact]
    public void InvertedIntervalIsRejected()
    {
        Assert.Throws<DomainValidationException>(() =>
            InstallationRules.Validate([new Installation { StartUtc = Start, EndUtc = Start }])
        );
    }
}
