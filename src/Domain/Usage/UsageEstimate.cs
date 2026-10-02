namespace BikeLog.Domain.Usage;

public static class UsageEstimate
{
    public static long Combined(long calculatedMetres, long estimateMetres)
    {
        if (calculatedMetres < 0 || estimateMetres < 0)
        {
            throw new DomainValidationException("Usage values must be nonnegative.");
        }
        return checked(calculatedMetres + estimateMetres);
    }
}
