namespace BikeLog.Api.Auth;

public sealed class CurrentOwner : ICurrentOwner
{
    private Guid? ownerId;

    public Guid OwnerId =>
        ownerId ?? throw new InvalidOperationException("No active owner resolved.");

    public void Set(Guid value)
    {
        if (value == Guid.Empty || ownerId is { } existing && existing != value)
        {
            throw new InvalidOperationException("Owner resolution changed during the request.");
        }
        ownerId = value;
    }
}
