using BikeLog.Domain.Components;

namespace BikeLog.Domain.Installations;

public static class ComponentCompatibility
{
    public static void Validate(ComponentType type, InstallationPosition position)
    {
        if (ComponentCatalog.Entry(position).Type != type)
        {
            throw new DomainValidationException(
                "Component type is incompatible with installation position."
            );
        }
    }
}
