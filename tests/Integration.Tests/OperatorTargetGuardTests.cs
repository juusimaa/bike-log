using BikeLog.Api.Operations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace BikeLog.Integration.Tests;

public class OperatorTargetGuardTests
{
    private const string Local =
        "Host=127.0.0.1;Port=54329;Database=bikelog_dev;Username=u;Password=p";
    private const string HostedHost = "pg-bikelog.example.test";
    private const string Hosted =
        $"Host={HostedHost};Port=12345;Database=defaultdb;Username=u;Password=p;SSL Mode=VerifyFull;Root Certificate=/mnt/secrets/aiven-ca-certificate";

    public static IConfiguration Settings(
        string connection,
        string accessMode = "Authenticated",
        bool synthetic = false,
        string? hostedHost = HostedHost
    ) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["AccessMode"] = accessMode,
                    ["LocalSyntheticMode"] = synthetic.ToString(),
                    ["ConnectionStrings:Postgres"] = connection,
                    ["Operator:HostedDatabaseHost"] = hostedHost,
                }
            )
            .Build();

    [Theory]
    [InlineData(Local)]
    [InlineData("Host=127.0.0.1;Port=54329;Database=bikelog_test_abc;Username=u;Password=p")]
    public void AllowsTheUnchangedLocalTarget(string connection)
    {
        Assert.Equal(
            OperatorTarget.Local,
            OperatorTargetGuard.Validate(
                Settings(connection),
                new TestHostEnvironment("Development"),
                connection
            )
        );
    }

    [Fact]
    public void AllowsTheGuardedHostedTarget()
    {
        Assert.Equal(
            OperatorTarget.Hosted,
            OperatorTargetGuard.Validate(
                Settings(Hosted),
                new TestHostEnvironment("Production"),
                Hosted
            )
        );
        var differentCase = Hosted.Replace(HostedHost, HostedHost.ToUpperInvariant());
        Assert.Equal(
            OperatorTarget.Hosted,
            OperatorTargetGuard.Validate(
                Settings(differentCase),
                new TestHostEnvironment("Production"),
                differentCase
            )
        );
    }

    [Theory]
    [InlineData("Production", "SSL Mode=Require", "Authenticated", false, HostedHost, "VerifyFull")]
    [InlineData("Production", "no-root", "Authenticated", false, HostedHost, "root certificate")]
    [InlineData("Production", "other-host", "Authenticated", false, HostedHost, "does not match")]
    [InlineData("Production", "", "Authenticated", false, "", "Operator:HostedDatabaseHost")]
    [InlineData("Staging", "", "Authenticated", false, HostedHost, "Development or Production")]
    [InlineData("Production", "", "Synthetic", true, HostedHost, "Authenticated")]
    [InlineData("Development", "", "Authenticated", false, HostedHost, "loopback")]
    public void RefusesEveryOtherTargetWithADistinctReason(
        string environment,
        string defect,
        string accessMode,
        bool synthetic,
        string hostedHost,
        string reason
    )
    {
        var connection = defect switch
        {
            "SSL Mode=Require" => Hosted.Replace("SSL Mode=VerifyFull", defect),
            "no-root" => Hosted.Replace(";Root Certificate=/mnt/secrets/aiven-ca-certificate", ""),
            "other-host" => Hosted.Replace(HostedHost, "other.example.test"),
            _ => Hosted,
        };
        var error = Assert.Throws<InvalidOperationException>(() =>
            OperatorTargetGuard.Validate(
                Settings(connection, accessMode, synthetic, hostedHost),
                new TestHostEnvironment(environment),
                connection
            )
        );
        Assert.Contains(reason, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void RefusesAConnectionThatDiffersFromTheConfiguredOne()
    {
        var other = Local.Replace("Password=p", "Password=q");
        Assert.Throws<InvalidOperationException>(() =>
            OperatorTargetGuard.Validate(
                Settings(Local),
                new TestHostEnvironment("Development"),
                other
            )
        );
    }

    public sealed class TestHostEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "BikeLog.Api";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
