using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests.Fixtures;

public sealed class ApiScenario : IAsyncDisposable
{
    public static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-01-01T00:00:00Z");
    public static readonly Guid Owner = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private readonly PostgresFixture database = new();
    public ApiFactory Factory { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;
    public string ConnectionString => database.ConnectionString;

    public static async Task<ApiScenario> Open()
    {
        var s = new ApiScenario();
        await s.database.InitializeAsync();
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            await db.Database.MigrateAsync();
        }

        s.Factory = new(s.ConnectionString);
        s.Client = s.Factory.CreateClient();
        return s;
    }

    public async Task<JsonElement> Create(string path, object body)
    {
        var r = await Client.PostAsJsonAsync(path, body);
        Assert.Equal(201, (int)r.StatusCode);
        Assert.NotNull(r.Headers.Location);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).Clone();
    }

    public async Task<(Guid Bike, Guid Chain, Guid Installation)> Equipment()
    {
        var bike = Id(await Create("/api/bikes", new { name = "Synthetic gravel" }));
        var chain = Id(
            await Create("/api/components", new { type = "chain", model = "Synthetic A" })
        );
        var install = Id(
            await Create(
                "/api/installations",
                new
                {
                    bikeId = bike,
                    componentId = chain,
                    position = "chain",
                    startUtc = Start,
                }
            )
        );
        return (bike, chain, install);
    }

    public async Task<Guid> Chain() =>
        Id(await Create("/api/components", new { type = "chain", model = "Synthetic B" }));

    public async Task<JsonElement> Read(string path)
    {
        var r = await Client.GetAsync(path);
        Assert.Equal(200, (int)r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).Clone();
    }

    public static Guid Id(JsonElement element) => element.GetProperty("id").GetGuid();

    public async ValueTask DisposeAsync()
    {
        Client?.Dispose();
        if (Factory != null)
        {
            await Factory.DisposeAsync();
        }

        await database.DisposeAsync();
    }
}
