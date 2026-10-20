using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;

namespace BikeLog.Domain.Tests;

public class ComponentCatalogTests
{
    private static readonly (
        InstallationPosition Position,
        ComponentType Type,
        ComponentGroup Group,
        WheelEnd? End
    )[] Expected =
    [
        (InstallationPosition.Fork, ComponentType.Fork, ComponentGroup.Build, null),
        (
            InstallationPosition.BottomBracket,
            ComponentType.BottomBracket,
            ComponentGroup.Build,
            null
        ),
        (InstallationPosition.Handlebar, ComponentType.Handlebar, ComponentGroup.Build, null),
        (
            InstallationPosition.HandlebarTape,
            ComponentType.HandlebarTape,
            ComponentGroup.Build,
            null
        ),
        (InstallationPosition.Saddle, ComponentType.Saddle, ComponentGroup.Build, null),
        (InstallationPosition.Seatpost, ComponentType.Seatpost, ComponentGroup.Build, null),
        (InstallationPosition.Pedals, ComponentType.Pedals, ComponentGroup.Build, null),
        (
            InstallationPosition.FrontThroughAxle,
            ComponentType.ThroughAxle,
            ComponentGroup.Build,
            WheelEnd.Front
        ),
        (
            InstallationPosition.RearThroughAxle,
            ComponentType.ThroughAxle,
            ComponentGroup.Build,
            WheelEnd.Rear
        ),
        (
            InstallationPosition.FrontDerailleur,
            ComponentType.FrontDerailleur,
            ComponentGroup.Groupset,
            null
        ),
        (
            InstallationPosition.RearDerailleur,
            ComponentType.RearDerailleur,
            ComponentGroup.Groupset,
            null
        ),
        (InstallationPosition.Shifters, ComponentType.Shifters, ComponentGroup.Groupset, null),
        (InstallationPosition.Cassette, ComponentType.Cassette, ComponentGroup.Groupset, null),
        (InstallationPosition.Chain, ComponentType.Chain, ComponentGroup.Groupset, null),
        (
            InstallationPosition.FrontBrake,
            ComponentType.Brake,
            ComponentGroup.Groupset,
            WheelEnd.Front
        ),
        (
            InstallationPosition.RearBrake,
            ComponentType.Brake,
            ComponentGroup.Groupset,
            WheelEnd.Rear
        ),
        (
            InstallationPosition.FrontBrakeLever,
            ComponentType.BrakeLever,
            ComponentGroup.Groupset,
            WheelEnd.Front
        ),
        (
            InstallationPosition.RearBrakeLever,
            ComponentType.BrakeLever,
            ComponentGroup.Groupset,
            WheelEnd.Rear
        ),
        (InstallationPosition.Crankset, ComponentType.Crankset, ComponentGroup.Groupset, null),
        (InstallationPosition.Chainring, ComponentType.Chainring, ComponentGroup.Groupset, null),
        (InstallationPosition.FrontRim, ComponentType.Rim, ComponentGroup.Wheels, WheelEnd.Front),
        (InstallationPosition.RearRim, ComponentType.Rim, ComponentGroup.Wheels, WheelEnd.Rear),
        (InstallationPosition.FrontTyre, ComponentType.Tyre, ComponentGroup.Wheels, WheelEnd.Front),
        (InstallationPosition.RearTyre, ComponentType.Tyre, ComponentGroup.Wheels, WheelEnd.Rear),
        (
            InstallationPosition.FrontDiscRotor,
            ComponentType.DiscRotor,
            ComponentGroup.Wheels,
            WheelEnd.Front
        ),
        (
            InstallationPosition.RearDiscRotor,
            ComponentType.DiscRotor,
            ComponentGroup.Wheels,
            WheelEnd.Rear
        ),
        (
            InstallationPosition.FrontInnerTube,
            ComponentType.InnerTube,
            ComponentGroup.Wheels,
            WheelEnd.Front
        ),
        (
            InstallationPosition.RearInnerTube,
            ComponentType.InnerTube,
            ComponentGroup.Wheels,
            WheelEnd.Rear
        ),
    ];

    [Fact]
    public void CatalogHas28PositionsAnd21Types()
    {
        Assert.Equal(28, ComponentCatalog.Entries.Count);
        Assert.Equal(28, Enum.GetValues<InstallationPosition>().Length);
        Assert.Equal(21, Enum.GetValues<ComponentType>().Length);
        Assert.Equal(21, ComponentCatalog.Entries.Select(x => x.Type).Distinct().Count());
    }

    [Fact]
    public void EntriesMatchTheDataModelInOrder()
    {
        Assert.Equal(
            Expected,
            ComponentCatalog.Entries.Select(x => (x.Position, x.Type, x.Group, x.End)).ToArray()
        );
        foreach (var e in Expected)
        {
            var entry = ComponentCatalog.Entry(e.Position);
            Assert.Equal(e.Type, entry.Type);
            Assert.False(string.IsNullOrWhiteSpace(entry.Label));
        }
    }

    [Fact]
    public void OnlyFrontDerailleurShiftersAndInnerTubesCanBeEmpty()
    {
        var exempt = ComponentCatalog
            .Entries.Where(x => x.Exemption.HasValue)
            .Select(x => (x.Position, x.Exemption!.Value))
            .ToArray();
        Assert.Equal(
            [
                (InstallationPosition.FrontDerailleur, ExemptionReason.NoneFitted),
                (InstallationPosition.Shifters, ExemptionReason.NoneFitted),
                (InstallationPosition.FrontInnerTube, ExemptionReason.Tubeless),
                (InstallationPosition.RearInnerTube, ExemptionReason.Tubeless),
            ],
            exempt
        );
    }

    [Fact]
    public void PairTypesAreFrontRearTypes()
    {
        Assert.Equal(
            [
                ComponentType.ThroughAxle,
                ComponentType.Brake,
                ComponentType.BrakeLever,
                ComponentType.Rim,
                ComponentType.Tyre,
                ComponentType.DiscRotor,
                ComponentType.InnerTube,
            ],
            ComponentCatalog.PairTypes
        );
        Assert.Equal(
            (InstallationPosition.FrontBrake, InstallationPosition.RearBrake),
            ComponentCatalog.FrontRearPositions(ComponentType.Brake)
        );
        Assert.Throws<DomainValidationException>(() =>
            ComponentCatalog.FrontRearPositions(ComponentType.Saddle)
        );
    }

    [Fact]
    public void EveryTypeHasOneGroupAndAtLeastOnePosition()
    {
        foreach (var type in Enum.GetValues<ComponentType>())
        {
            Assert.Single(
                ComponentCatalog.Entries.Where(x => x.Type == type).Select(x => x.Group).Distinct()
            );
            Assert.NotEmpty(ComponentCatalog.PositionsFor(type));
            Assert.Equal(
                ComponentCatalog.Entries.First(x => x.Type == type).Group,
                ComponentCatalog.GroupOf(type)
            );
        }
    }

    [Fact]
    public void ExistingPositionLabelsKeepReplacementTaskNames()
    {
        Assert.Equal("Front tyre", ComponentCatalog.Entry(InstallationPosition.FrontTyre).Label);
        Assert.Equal("Chain", ComponentCatalog.Entry(InstallationPosition.Chain).Label);
        Assert.Equal(
            "Front brake lever",
            ComponentCatalog.Entry(InstallationPosition.FrontBrakeLever).Label
        );
        Assert.Equal(
            "Bottom bracket",
            ComponentCatalog.Entry(InstallationPosition.BottomBracket).Label
        );
    }
}
