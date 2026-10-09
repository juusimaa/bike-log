using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace BikeLog.Integration.Tests.Fixtures;

public sealed class TestIssuer : IDisposable
{
    public const string Issuer = "https://issuer.example.test/";
    public const string Audience = "https://api.example.test/bike-log";
    private readonly RSA rsa = RSA.Create(2048);

    public ApiFactory Factory(string connection, bool synthetic = false)
    {
        var key = new RsaSecurityKey(rsa) { KeyId = "local-test-key" };
        var metadata = new OpenIdConnectConfiguration { Issuer = Issuer };
        metadata.SigningKeys.Add(key);
        return new ApiFactory(
            connection,
            enabled: synthetic,
            configure: services =>
                services.PostConfigure<JwtBearerOptions>(
                    JwtBearerDefaults.AuthenticationScheme,
                    options =>
                        options.ConfigurationManager =
                            new StaticConfigurationManager<OpenIdConnectConfiguration>(metadata)
                ),
            settings: new Dictionary<string, string?>
            {
                ["AccessMode"] = "Authenticated",
                ["Auth:Issuer"] = Issuer,
                ["Auth:Audience"] = Audience,
                ["Auth:Scope"] = "BikeLog.Access",
            }
        );
    }

    public string Token(string subject = "email|pilot-one")
    {
        var now = DateTime.UtcNow;
        var jwt = new JwtSecurityToken(
            issuer: Issuer,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, subject),
                new Claim(JwtRegisteredClaimNames.Aud, Audience),
                new Claim("scope", "BikeLog.Access"),
            ],
            notBefore: now.AddMinutes(-1),
            expires: now.AddHours(1),
            signingCredentials: new SigningCredentials(
                new RsaSecurityKey(rsa) { KeyId = "local-test-key" },
                SecurityAlgorithms.RsaSha256
            )
        );
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    public void Dispose() => rsa.Dispose();
}
