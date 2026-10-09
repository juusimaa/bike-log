using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace BikeLog.Integration.Tests;

public class AuthBoundaryTests(PostgresFixture database)
    : IClassFixture<PostgresFixture>,
        IDisposable
{
    private const string LocalConnection =
        "Host=127.0.0.1;Port=54329;Database=unused;Username=unused;Password=unused";
    private const string Issuer = "https://issuer.example.test/";
    private const string Audience = "https://api.example.test/bike-log";
    private readonly RSA rsa = RSA.Create(2048);

    private ApiFactory AuthenticatedFactory(IReadOnlyDictionary<string, string?>? overrides = null)
    {
        var key = new RsaSecurityKey(rsa) { KeyId = "local-test-key" };
        var metadata = new OpenIdConnectConfiguration { Issuer = Issuer };
        metadata.SigningKeys.Add(key);
        var settings = new Dictionary<string, string?>
        {
            ["AccessMode"] = "Authenticated",
            ["Auth:Issuer"] = Issuer,
            ["Auth:Audience"] = Audience,
            ["Auth:Scope"] = "BikeLog.Access",
        };
        if (overrides is not null)
        {
            foreach (var (name, value) in overrides)
            {
                settings[name] = value;
            }
        }
        return new ApiFactory(
            database.ConnectionString,
            enabled: false,
            configure: services =>
                services.PostConfigure<JwtBearerOptions>(
                    JwtBearerDefaults.AuthenticationScheme,
                    options =>
                        options.ConfigurationManager =
                            new StaticConfigurationManager<OpenIdConnectConfiguration>(metadata)
                ),
            settings: settings
        );
    }

    private string Token(
        string issuer = Issuer,
        string? audience = Audience,
        string? scope = "BikeLog.Access",
        bool expired = false,
        bool signedByOtherKey = false,
        bool includeSubject = true,
        string? secondAudience = null
    )
    {
        var claims = new List<Claim>();
        if (includeSubject)
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Sub, "email|pilot-one"));
        }
        if (scope is not null)
        {
            claims.Add(new Claim("scope", scope));
        }
        if (audience is not null)
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Aud, audience));
        }
        if (secondAudience is not null)
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Aud, secondAudience));
        }
        using var otherKey = signedByOtherKey ? RSA.Create(2048) : null;
        var signingKey = new RsaSecurityKey(otherKey ?? rsa) { KeyId = "local-test-key" };
        var now = DateTime.UtcNow;
        var jwt = new JwtSecurityToken(
            issuer: issuer,
            claims: claims,
            notBefore: expired ? now.AddHours(-2) : now.AddMinutes(-1),
            expires: expired ? now.AddHours(-1) : now.AddHours(1),
            signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.RsaSha256)
        );
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    private async Task<HttpStatusCode> RequestWithToken(string token, bool migrate = false)
    {
        if (migrate)
        {
            await using var db = TestDatabase.Open(database.ConnectionString);
            await db.Database.MigrateAsync();
        }
        await using var app = AuthenticatedFactory();
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (await client.GetAsync("/api/bikes")).StatusCode;
    }

    [Fact]
    public async Task AuthenticatedApiRejectsMissingTokenBeforeReadingData()
    {
        await using var app = AuthenticatedFactory();

        var response = await app.CreateClient().GetAsync("/api/bikes");

        Assert.True(
            response.StatusCode == HttpStatusCode.Unauthorized,
            $"Expected 401, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}"
        );
    }

    [Fact]
    public async Task ValidApiTokenFailsClosedUntilLocalUserRegistryExists()
    {
        Assert.Equal(HttpStatusCode.Forbidden, await RequestWithToken(Token(), migrate: true));
    }

    [Theory]
    [InlineData("wrong-issuer")]
    [InlineData("wrong-audience")]
    [InlineData("wrong-scope")]
    [InlineData("scope-substring")]
    [InlineData("expired")]
    [InlineData("wrong-signature")]
    [InlineData("missing-subject")]
    [InlineData("id-token")]
    public async Task RejectsTokenThatIsNotAValidBikeLogAccessToken(string defect)
    {
        var token = defect switch
        {
            "wrong-issuer" => Token(issuer: "https://other.example.test/"),
            "wrong-audience" => Token(audience: "https://other-api.example.test/"),
            "wrong-scope" => Token(scope: "Other.Access"),
            "scope-substring" => Token(scope: "BikeLog.AccessExtra"),
            "expired" => Token(expired: true),
            "wrong-signature" => Token(signedByOtherKey: true),
            "missing-subject" => Token(includeSubject: false),
            "id-token" => Token(audience: "bike-log-web-client", scope: null),
            _ => throw new ArgumentOutOfRangeException(nameof(defect)),
        };

        Assert.Equal(HttpStatusCode.Unauthorized, await RequestWithToken(token));
    }

    [Fact]
    public async Task AcceptsApiAudienceInArrayButRejectsArrayWithoutIt()
    {
        Assert.Equal(
            HttpStatusCode.Forbidden,
            await RequestWithToken(
                Token(audience: "bike-log-web-client", secondAudience: Audience),
                migrate: true
            )
        );
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            await RequestWithToken(
                Token(audience: "bike-log-web-client", secondAudience: "other-api")
            )
        );
    }

    [Fact]
    public async Task AcceptsScopeAsOneMemberOfSpaceDelimitedList()
    {
        Assert.Equal(
            HttpStatusCode.Forbidden,
            await RequestWithToken(
                Token(scope: "profile BikeLog.Access offline_access"),
                migrate: true
            )
        );
    }

    [Fact]
    public async Task OpenApiAndHealthDoNotExposeIdentityDataWithoutToken()
    {
        await using var app = AuthenticatedFactory();
        using var client = app.CreateClient();
        var openApi = await client.GetAsync("/openapi/v1.json");
        var health = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, openApi.StatusCode);
        var schema = await openApi.Content.ReadAsStringAsync();
        Assert.DoesNotContain("email|pilot-one", schema);
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.DoesNotContain("email", await health.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("Auth:Issuer")]
    [InlineData("Auth:Audience")]
    [InlineData("Auth:Scope")]
    [InlineData("AccessMode")]
    [InlineData("Auth:Scope:wrong")]
    public void RejectsIncompleteOrWrongAuthenticatedConfiguration(string missing)
    {
        var key = missing == "Auth:Scope:wrong" ? "Auth:Scope" : missing;
        var value = missing == "Auth:Scope:wrong" ? "Other.Access" : "";
        using var app = AuthenticatedFactory(new Dictionary<string, string?> { [key] = value });
        Assert.Throws<InvalidOperationException>(() => app.CreateClient());
    }

    [Fact]
    public void RejectsMixedSyntheticAndAuthenticatedModes()
    {
        using var app = new ApiFactory(
            LocalConnection,
            enabled: true,
            settings: new Dictionary<string, string?>
            {
                ["AccessMode"] = "Authenticated",
                ["Auth:Issuer"] = Issuer,
                ["Auth:Audience"] = Audience,
                ["Auth:Scope"] = "BikeLog.Access",
            }
        );
        Assert.Throws<InvalidOperationException>(() => app.CreateClient());
    }

    public void Dispose() => rsa.Dispose();
}
