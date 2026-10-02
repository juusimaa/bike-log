namespace BikeLog.Domain.Reminders;

public enum LubricationMethod
{
    Oil,
    Wax,
}

public sealed class ChainLubricationRule : Entity
{
    public Guid BikeId { get; set; }
    public bool Enabled { get; set; }
    public LubricationMethod? Method { get; set; }
    public long? OilThresholdMetres { get; set; }
    public long? WaxThresholdMetres { get; set; }

    public bool IsConfigured =>
        Method is LubricationMethod.Oil or LubricationMethod.Wax
        && ValidThreshold(OilThresholdMetres)
        && ValidThreshold(WaxThresholdMetres);

    private static bool ValidThreshold(long? value) => value is >= 1000 and <= 10000000;

    public void Validate()
    {
        if (Method.HasValue && !Enum.IsDefined(Method.Value))
        {
            throw new DomainValidationException("Unknown lubrication method.");
        }
        if (
            (OilThresholdMetres.HasValue && !ValidThreshold(OilThresholdMetres))
            || (WaxThresholdMetres.HasValue && !ValidThreshold(WaxThresholdMetres))
        )
        {
            throw new DomainValidationException(
                "Reminder thresholds must be between 1,000 and 10,000,000 metres."
            );
        }
        if (Enabled && !IsConfigured)
        {
            throw new DomainValidationException(
                "Enabling a reminder requires a method and both thresholds."
            );
        }
    }
}
