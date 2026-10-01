using System.Net;
using BikeLog.Integration.Tests.Fixtures;
namespace BikeLog.Integration.Tests;

public class HostTests : IClassFixture<PostgresFixture>
{
    private readonly string connection;
    public HostTests(PostgresFixture fixture) => connection = fixture.ConnectionString;
    [Fact]
    public async Task ReadyRequiresReachablePostgres()
    {
        await using var good = new ApiFactory(connection);
        Assert.Equal(HttpStatusCode.OK, (await good.CreateClient().GetAsync("/health/ready")).StatusCode);
        await using var bad = new ApiFactory("Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused;Timeout=1");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await bad.CreateClient().GetAsync("/health/ready")).StatusCode);
    }
    [Theory]
    [InlineData("Production", true)]
    [InlineData("Development", false)]
    public void RejectsProductionAndUnconfiguredSyntheticMode(string env, bool enabled)
    { using var app = new ApiFactory(connection, env, enabled); Assert.Throws<InvalidOperationException>(() => app.CreateClient()); }
    [Theory]
    [InlineData("http://0.0.0.0:5080")]
    [InlineData("http://192.168.1.10:5080")]
    public void RejectsNonLoopbackBinding(string urls)
    { using var app = new ApiFactory(connection, urls: urls); Assert.Throws<InvalidOperationException>(() => app.CreateClient()); }
    [Fact]
    public async Task OpenApiIsAvailableLocally()
    { await using var app = new ApiFactory(connection); var r = await app.CreateClient().GetAsync("/openapi/v1.json"); Assert.Equal(HttpStatusCode.OK, r.StatusCode); Assert.Contains("openapi", await r.Content.ReadAsStringAsync()); }
    [Fact]
    public async Task OpenApiDescribesCreatedRecordsAndConflicts()
    {
        await using var app = new ApiFactory(connection);
        var json = System.Text.Json.JsonDocument.Parse(await app.CreateClient().GetStringAsync("/openapi/v1.json"));
        var responses = json.RootElement.GetProperty("paths").GetProperty("/api/bikes").GetProperty("post").GetProperty("responses");
        Assert.True(responses.TryGetProperty("201", out _));
        Assert.True(responses.TryGetProperty("400", out _));
        var edit = json.RootElement.GetProperty("paths").GetProperty("/api/rides/{id}").GetProperty("put").GetProperty("responses");
        Assert.True(edit.TryGetProperty("409", out _));
    }
}
