using BikeLog.Domain.Components;

namespace BikeLog.Domain.Installations;

public static class ComponentCompatibility
{
    public static void Validate(ComponentType type, InstallationPosition position)
    {
        var valid = type switch
        {
            ComponentType.Chain => position == InstallationPosition.Chain,
            ComponentType.Cassette => position == InstallationPosition.Cassette,
            ComponentType.Tyre => position
                is InstallationPosition.FrontTyre
                    or InstallationPosition.RearTyre,
            _ => false,
        };
        if (!valid)
        {
            throw new DomainValidationException(
                "Component type is incompatible with installation position."
            );
        }
    }
}
