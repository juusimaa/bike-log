using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BikeLog.Integration.Tests.Fixtures;

public class ApiFactory(
    string connectionString,
    string environment = "Development",
    bool enabled = true,
    string urls = "http://127.0.0.1:5080",
    Action<IServiceCollection>? configure = null,
    TimeProvider? timeProvider = null,
    IReadOnlyDictionary<string, string?>? settings = null
) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.UseSetting("AccessMode", settings?.GetValueOrDefault("AccessMode") ?? "Synthetic");
        builder.UseSetting("LocalSyntheticMode", enabled.ToString());
        if (settings is not null)
        {
            foreach (var (key, value) in settings)
            {
                if (value is not null)
                {
                    builder.UseSetting(key, value);
                }
            }
        }
        if (timeProvider is not null)
        {
            builder.ConfigureServices(services => services.AddSingleton(timeProvider));
        }
        if (configure != null)
        {
            builder.ConfigureServices(configure);
        }

        builder.ConfigureAppConfiguration(
            (_, configuration) =>
            {
                var values = new Dictionary<string, string?>
                {
                    ["LocalSyntheticMode"] = enabled.ToString(),
                    ["AccessMode"] = "Synthetic",
                    ["urls"] = urls,
                    ["ConnectionStrings:Postgres"] = connectionString,
                };
                if (settings is not null)
                {
                    foreach (var (key, value) in settings)
                    {
                        values[key] = value;
                    }
                }
                configuration.AddInMemoryCollection(values);
            }
        );
    }
}
