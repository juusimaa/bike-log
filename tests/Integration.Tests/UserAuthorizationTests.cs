using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests;

public class UserAuthorizationTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    private static void Authorize(HttpClient client, string token) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

    private async Task AddUser(string subject, bool enabled = true, string? email = null)
    {
        await using var db = TestDatabase.Open(database.ConnectionString);
        await db.Database.MigrateAsync();
        db.BikeLogUsers.Add(
            new BikeLogUser
            {
                OwnerId = Guid.NewGuid(),
                Issuer = TestIssuer.Issuer,
                Subject = subject,
                Enabled = enabled,
                Email = email,
                DisplayName = "Pilot",
            }
        );
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task ValidUnprovisionedIdentityIsForbiddenAtMeEndpoint()
    {
        using var issuer = new TestIssuer();
        await using (var db = TestDatabase.Open(database.ConnectionString))
        {
            await db.Database.MigrateAsync();
        }
        await using var app = issuer.Factory(database.ConnectionString);
        using var client = app.CreateClient();
        Authorize(client, issuer.Token());

        var response = await client.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ActivePilotUserCanReadOnlyTheirProfile()
    {
        const string subject = "email|active-pilot";
        await AddUser(subject, email: "pilot@example.test");
        using var issuer = new TestIssuer();
        await using var app = issuer.Factory(database.ConnectionString);
        using var client = app.CreateClient();
        Authorize(client, issuer.Token(subject));

        var response = await client.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("pilot@example.test", profile.GetProperty("email").GetString());
        Assert.Equal("Pilot", profile.GetProperty("displayName").GetString());
        Assert.False(profile.TryGetProperty("ownerId", out _));
    }

    [Fact]
    public async Task DisabledUserIsForbiddenOnNextRequest()
    {
        const string subject = "email|disabled-pilot";
        await AddUser(subject);
        using var issuer = new TestIssuer();
        await using var app = issuer.Factory(database.ConnectionString);
        using var client = app.CreateClient();
        Authorize(client, issuer.Token(subject));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/me")).StatusCode);

        await using (var db = TestDatabase.Open(database.ConnectionString))
        {
            var user = await db.BikeLogUsers.SingleAsync(x => x.Subject == subject);
            user.Enabled = false;
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task EmailChangeKeepsExternalIdentityAccess()
    {
        const string subject = "email|renamed-pilot";
        await AddUser(subject, email: "old@example.test");
        using var issuer = new TestIssuer();
        await using var app = issuer.Factory(database.ConnectionString);
        using var client = app.CreateClient();
        Authorize(client, issuer.Token(subject));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/me")).StatusCode);

        Guid originalOwner;
        await using (var db = TestDatabase.Open(database.ConnectionString))
        {
            var user = await db.BikeLogUsers.SingleAsync(x => x.Subject == subject);
            originalOwner = user.OwnerId;
            user.Email = "new@example.test";
            await db.SaveChangesAsync();
        }

        var response = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/me");
        Assert.Equal("new@example.test", response.GetProperty("email").GetString());
        await using var verify = TestDatabase.Open(database.ConnectionString);
        Assert.Equal(
            originalOwner,
            (await verify.BikeLogUsers.SingleAsync(x => x.Subject == subject)).OwnerId
        );
    }

    [Fact]
    public async Task ExternalIdentityAndOwnerKeysAreUnique()
    {
        const string subject = "email|unique-pilot";
        await AddUser(subject);
        await using var read = TestDatabase.Open(database.ConnectionString);
        var owner = (await read.BikeLogUsers.SingleAsync(x => x.Subject == subject)).OwnerId;

        await using var duplicateIdentity = TestDatabase.Open(database.ConnectionString);
        duplicateIdentity.BikeLogUsers.Add(
            new BikeLogUser
            {
                OwnerId = Guid.NewGuid(),
                Issuer = TestIssuer.Issuer,
                Subject = subject,
                Enabled = true,
            }
        );
        await Assert.ThrowsAsync<DbUpdateException>(() => duplicateIdentity.SaveChangesAsync());

        await using var duplicateOwner = TestDatabase.Open(database.ConnectionString);
        duplicateOwner.BikeLogUsers.Add(
            new BikeLogUser
            {
                OwnerId = owner,
                Issuer = TestIssuer.Issuer,
                Subject = "email|other-pilot",
                Enabled = true,
            }
        );
        await Assert.ThrowsAsync<DbUpdateException>(() => duplicateOwner.SaveChangesAsync());
    }

    [Fact]
    public async Task AuthenticationMigrationPreservesExistingBikeAndAddsSessionTables()
    {
        var isolated = new PostgresFixture();
        await isolated.InitializeAsync();
        try
        {
            var bikeId = Guid.NewGuid();
            int migrationsBefore;
            await using (var before = TestDatabase.Open(isolated.ConnectionString))
            {
                await before.Database.MigrateAsync("20261003152835_ComponentMake");
                before.Bikes.Add(
                    new Bike
                    {
                        Id = bikeId,
                        OwnerId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                        Name = "Existing synthetic bike",
                    }
                );
                await before.SaveChangesAsync();
                migrationsBefore = (await before.Database.GetAppliedMigrationsAsync()).Count();
            }

            await using (var after = TestDatabase.Open(isolated.ConnectionString))
            {
                await after.Database.MigrateAsync();
                Assert.Equal(
                    "Existing synthetic bike",
                    (await after.Bikes.SingleAsync(x => x.Id == bikeId)).Name
                );
                Assert.Equal(
                    migrationsBefore + 1,
                    (await after.Database.GetAppliedMigrationsAsync()).Count()
                );
                Assert.Empty(await after.WebSessions.ToListAsync());
                Assert.Empty(await after.OidcLoginTransactions.ToListAsync());
            }
        }
        finally
        {
            await isolated.DisposeAsync();
        }
    }
}
