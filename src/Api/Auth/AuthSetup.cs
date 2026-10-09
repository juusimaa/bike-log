using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace BikeLog.Api.Auth;

public static class AuthSetup
{
    public static AccessMode AddBikeLogAuthentication(
        IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        if (
            !Enum.TryParse<AccessMode>(configuration["AccessMode"], false, out var mode)
            || !Enum.IsDefined(mode)
        )
        {
            throw new InvalidOperationException("AccessMode must be Synthetic or Authenticated.");
        }

        if (mode == AccessMode.Synthetic)
        {
            return mode;
        }

        if (configuration.GetValue<bool>("LocalSyntheticMode"))
        {
            throw new InvalidOperationException(
                "Authenticated and synthetic modes cannot be combined."
            );
        }

        var settings = new AuthSettings(
            configuration["Auth:Issuer"] ?? "",
            configuration["Auth:Audience"] ?? "",
            configuration["Auth:Scope"] ?? ""
        );
        if (
            !Uri.TryCreate(settings.Issuer, UriKind.Absolute, out var issuer)
            || issuer.Scheme != Uri.UriSchemeHttps
            || !settings.Issuer.EndsWith("/", StringComparison.Ordinal)
            || string.IsNullOrWhiteSpace(settings.Audience)
            || settings.Scope != "BikeLog.Access"
        )
        {
            throw new InvalidOperationException(
                "Authenticated mode requires a HTTPS issuer, audience, and BikeLog.Access scope."
            );
        }

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = settings.Issuer;
                options.Audience = settings.Audience;
                options.MapInboundClaims = false;
                options.RequireHttpsMetadata = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = settings.Issuer,
                    ValidateAudience = true,
                    ValidAudience = settings.Audience,
                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    ClockSkew = TimeSpan.Zero,
                    NameClaimType = "sub",
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        var subject = context.Principal?.FindFirst("sub")?.Value;
                        var scopes = context
                            .Principal?.FindAll("scope")
                            .SelectMany(claim =>
                                claim.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                            );
                        if (
                            string.IsNullOrWhiteSpace(subject)
                            || scopes is null
                            || !scopes.Contains(settings.Scope, StringComparer.Ordinal)
                        )
                        {
                            context.Fail("Invalid Bike Log access token claims.");
                        }
                        return Task.CompletedTask;
                    },
                };
            });
        services
            .AddAuthorizationBuilder()
            .AddPolicy(
                "BikeLogAccess",
                policy => policy.RequireAuthenticatedUser().RequireAssertion(_ => false)
            );
        return mode;
    }
}
