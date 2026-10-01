using System.Net;
using Npgsql;
namespace BikeLog.Api.Development;

public interface IDevelopmentOwner
{
    Guid OwnerId
    {
        get;
    }
}
public sealed class DevelopmentOwner : IDevelopmentOwner
{
    public Guid OwnerId => Guid.Parse("11111111-1111-1111-1111-111111111111");
}
public static class DevelopmentAccess
{
    public static void Validate(IHostEnvironment environment, IConfiguration configuration)
    {
        if (!environment.IsDevelopment() || !configuration.GetValue<bool>("LocalSyntheticMode"))
        {
            throw new InvalidOperationException("This unauthenticated slice requires Development and explicit LocalSyntheticMode=true; use synthetic records only.");
        }

        var urls = configuration["urls"];
        if (string.IsNullOrWhiteSpace(urls) || configuration.GetSection("Kestrel:Endpoints").GetChildren().Any())
        {
            throw new InvalidOperationException("Explicit loopback URLs are required; Kestrel endpoint overrides are unsupported.");
        }

        foreach (var url in urls.Split(';'))
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != "http" || !IPAddress.TryParse(u.Host.Trim('[', ']'), out var ip) || !IPAddress.IsLoopback(ip))
            {
                throw new InvalidOperationException("Only explicit loopback HTTP bindings are permitted.");
            }
        }

        var c = new NpgsqlConnectionStringBuilder(configuration.GetConnectionString("Postgres") ?? "");
        if (c.Host != "127.0.0.1" || string.IsNullOrEmpty(c.Database))
        {
            throw new InvalidOperationException("This slice only permits local PostgreSQL.");
        }
    }
}
