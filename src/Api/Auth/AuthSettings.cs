namespace BikeLog.Api.Auth;

public sealed record AuthSettings(string Issuer, string Audience, string Scope);
