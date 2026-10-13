namespace BikeLog.Domain.Components;

public static class ComponentWeight
{
    public const int MaxGrams = 20000;

    /// <summary>Null means not recorded; otherwise 1–20000.</summary>
    public static void Validate(int? grams)
    {
        if (grams is < 1 or > MaxGrams)
        {
            throw new DomainValidationException(
                "Weight must be a whole number of grams from 1 to 20000."
            );
        }
    }
}
