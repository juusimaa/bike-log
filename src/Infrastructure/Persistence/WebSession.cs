namespace BikeLog.Infrastructure.Persistence;

public sealed class WebSession
{
    public required string SessionIdHash { get; set; }
    public required string EncryptedTokens { get; set; }
    public required string Issuer { get; set; }
    public required string Subject { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public int RotationVersion { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
}
