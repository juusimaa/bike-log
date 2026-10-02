using BikeLog.Domain;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;

namespace BikeLog.Api.Features.Components;

public static class ComponentValues
{
    public static ComponentType ParseType(string? value) =>
        value switch
        {
            "chain" => ComponentType.Chain,
            "cassette" => ComponentType.Cassette,
            "tyre" => ComponentType.Tyre,
            _ => throw new DomainValidationException("Unknown component type."),
        };

    public static string Type(ComponentType value) =>
        value switch
        {
            ComponentType.Chain => "chain",
            ComponentType.Cassette => "cassette",
            ComponentType.Tyre => "tyre",
            _ => throw new DomainValidationException("Unknown component type."),
        };

    public static InstallationPosition ParsePosition(string? value) =>
        value switch
        {
            "chain" => InstallationPosition.Chain,
            "cassette" => InstallationPosition.Cassette,
            "front-tyre" => InstallationPosition.FrontTyre,
            "rear-tyre" => InstallationPosition.RearTyre,
            _ => throw new DomainValidationException("Unknown installation position."),
        };

    public static string Position(InstallationPosition value) =>
        value switch
        {
            InstallationPosition.Chain => "chain",
            InstallationPosition.Cassette => "cassette",
            InstallationPosition.FrontTyre => "front-tyre",
            InstallationPosition.RearTyre => "rear-tyre",
            _ => throw new DomainValidationException("Unknown installation position."),
        };
}
