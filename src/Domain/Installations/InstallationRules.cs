namespace BikeLog.Domain.Installations;
public static class InstallationRules
{
    public static void Validate(IReadOnlyList<Installation> installations)
    {
        foreach (var i in installations)
            if (i.EndUtc is { } end && end <= i.StartUtc)
                throw new DomainValidationException("Installation end must be after start.");
        for (var a=0; a<installations.Count; a++)
        for (var b=a+1; b<installations.Count; b++)
        {
            var x=installations[a]; var y=installations[b];
            if (x.OwnerId != y.OwnerId) continue;
            var exclusive=x.ComponentId==y.ComponentId || (x.BikeId==y.BikeId && x.Position==y.Position);
            if (exclusive && (!y.EndUtc.HasValue || x.StartUtc<y.EndUtc) && (!x.EndUtc.HasValue || y.StartUtc<x.EndUtc))
                throw new DomainValidationException("A component or bike position already has an overlapping installation.","installation_overlap");
        }
    }
}
