using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
namespace BikeLog.Integration.Tests.Fixtures;
public class ApiFactory(string connectionString, string environment = "Development", bool enabled = true, string urls = "http://127.0.0.1:5080") : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string,string?> {
            ["LocalSyntheticMode"] = enabled.ToString(), ["urls"] = urls, ["ConnectionStrings:Postgres"] = connectionString
        }));
    }
}
