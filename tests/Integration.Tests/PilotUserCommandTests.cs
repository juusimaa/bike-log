using BikeLog.Api.Auth;
using BikeLog.Api.Operations;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BikeLog.Integration.Tests;

public class PilotUserCommandTests
{
    [Fact]
    public void UsageRebuildRejectsAuthenticatedModeAndExtraArguments()
    {
        Assert.Throws<InvalidOperationException>(() =>
            OperatorCommandLine.ValidateRebuild(AccessMode.Authenticated, ["--rebuild-usage"])
        );
        Assert.Throws<InvalidOperationException>(() =>
            OperatorCommandLine.ValidateRebuild(
                AccessMode.Synthetic,
                ["--rebuild-usage", "--other"]
            )
        );
        OperatorCommandLine.ValidateRebuild(AccessMode.Synthetic, ["--rebuild-usage"]);
    }

    [Fact]
    public async Task ProvisionRejectsDuplicateExternalKeyAndEnableDisableKeepsOwner()
    {
        var database = new PostgresFixture();
        await database.InitializeAsync();
        try
        {
            await using var db = TestDatabase.Open(database.ConnectionString);
            await db.Database.MigrateAsync();
            var settings = new ConfigurationBuilder()
                .AddInMemoryCollection(
                    new Dictionary<string, string?>
                    {
                        ["AccessMode"] = "Authenticated",
                        ["LocalSyntheticMode"] = "false",
                        ["Auth:Issuer"] = TestIssuer.Issuer,
                        ["ConnectionStrings:Postgres"] = database.ConnectionString,
                    }
                )
                .Build();
            PilotUserCommands.ValidateTarget(db, settings, "Development", TestIssuer.Issuer);
            Assert.Throws<InvalidOperationException>(() =>
                PilotUserCommands.ValidateTarget(db, settings, "Production", TestIssuer.Issuer)
            );
            Assert.Throws<InvalidOperationException>(() =>
                PilotUserCommands.ValidateTarget(
                    db,
                    settings,
                    "Development",
                    "https://other.example.test/"
                )
            );
            var owner = await PilotUserCommands.ProvisionAsync(
                db,
                TestIssuer.Issuer,
                "email|operator-pilot",
                "pilot@example.test",
                CancellationToken.None
            );
            Assert.NotEqual(Guid.Empty, owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                PilotUserCommands.ProvisionAsync(
                    db,
                    TestIssuer.Issuer,
                    "email|operator-pilot",
                    "changed@example.test",
                    CancellationToken.None
                )
            );
            Assert.Single(
                await db.BikeLogUsers.Where(x => x.Subject == "email|operator-pilot").ToListAsync()
            );

            await PilotUserCommands.SetEnabledAsync(db, owner, false, CancellationToken.None);
            Assert.False((await db.BikeLogUsers.SingleAsync(x => x.OwnerId == owner)).Enabled);
            await PilotUserCommands.SetEnabledAsync(db, owner, true, CancellationToken.None);
            Assert.True((await db.BikeLogUsers.SingleAsync(x => x.OwnerId == owner)).Enabled);
        }
        finally
        {
            await database.DisposeAsync();
        }
    }
}
