using BikeLog.Domain.Installations;

namespace BikeLog.Domain.Tests;

public class ExemptionRulesTests
{
    private static readonly Guid Owner = Guid.NewGuid(),
        Bike = Guid.NewGuid();
    private static readonly DateTimeOffset A = DateTimeOffset.Parse("2026-01-01T00:00:00Z"),
        B = A.AddDays(10);

    private static PositionExemption Exempt(
        DateTimeOffset start,
        DateTimeOffset? end = null,
        InstallationPosition position = InstallationPosition.FrontDerailleur,
        ExemptionReason reason = ExemptionReason.NoneFitted
    ) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            Position = position,
            Reason = reason,
            StartUtc = start,
            EndUtc = end,
        };

    private static Installation Fitted(DateTimeOffset start, DateTimeOffset? end = null) =>
        new()
        {
            OwnerId = Owner,
            BikeId = Bike,
            ComponentId = Guid.NewGuid(),
            Position = InstallationPosition.FrontDerailleur,
            StartUtc = start,
            EndUtc = end,
        };

    private static void Overlap(Action act) =>
        Assert.Equal("installation_overlap", Assert.Throws<DomainValidationException>(act).Code);

    [Fact]
    public void OverlappingExemptionsAreRejected() =>
        Overlap(() => InstallationRules.Validate([], [Exempt(A, B), Exempt(A.AddDays(1))]));

    [Fact]
    public void ExemptionOverlappingAnInstallationIsRejected() =>
        Overlap(() => InstallationRules.Validate([Fitted(A)], [Exempt(B)]));

    [Fact]
    public void AdjacentPeriodsAreAccepted()
    {
        InstallationRules.Validate([], [Exempt(A, B), Exempt(B)]);
        InstallationRules.Validate([Fitted(A, B)], [Exempt(B)]);
    }

    [Fact]
    public void TubelessReasonOnFrontDerailleurIsRejected() =>
        Assert.Throws<DomainValidationException>(() =>
            InstallationRules.Validate([], [Exempt(A, reason: ExemptionReason.Tubeless)])
        );

    [Fact]
    public void PositionThatCannotBeEmptyIsRejected() =>
        Assert.Throws<DomainValidationException>(() =>
            InstallationRules.Validate([], [Exempt(A, position: InstallationPosition.Saddle)])
        );

    [Fact]
    public void OtherBikeOrPositionDoesNotConflict()
    {
        var tube = Exempt(
            A,
            position: InstallationPosition.RearInnerTube,
            reason: ExemptionReason.Tubeless
        );
        var otherBike = Exempt(A);
        otherBike.BikeId = Guid.NewGuid();
        InstallationRules.Validate([Fitted(A)], [tube, otherBike]);
    }
}
