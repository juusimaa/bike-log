namespace BikeLog.Api.Auth;

public interface ICurrentOwner
{
    Guid OwnerId { get; }
}
