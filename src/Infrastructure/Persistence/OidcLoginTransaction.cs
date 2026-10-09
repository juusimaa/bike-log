namespace BikeLog.Infrastructure.Persistence;

public sealed class OidcLoginTransaction
{
    public required string StateHash { get; set; }
    public required string EncryptedNonceAndVerifier { get; set; }
    public required string ReturnPath { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
}
