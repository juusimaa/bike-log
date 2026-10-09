namespace BikeLog.Infrastructure.Persistence;

public sealed class BikeLogUser
{
    public Guid OwnerId { get; set; }
    public required string Issuer { get; set; }
    public required string Subject { get; set; }
    public bool Enabled { get; set; }
    public string? Email { get; set; }
    public string? DisplayName { get; set; }
}
