using Npgsql;
namespace BikeLog.Integration.Tests.Fixtures;

public sealed class PostgresFixture : IAsyncLifetime
{
    public string ConnectionString { get; private set; } = "";
    private string database = "";
    private string admin = "";
    public async Task InitializeAsync()
    {
        admin = Environment.GetEnvironmentVariable("BIKELOG_TEST_ADMIN") ?? throw new InvalidOperationException("Run tests through scripts/dev.sh test.");
        var b = new NpgsqlConnectionStringBuilder(admin);
        if (b.Host != "127.0.0.1" || b.Port != 54329 || b.Database != "postgres") throw new InvalidOperationException("Only the dedicated loopback test server is permitted.");
        database = "bikelog_test_" + Guid.NewGuid().ToString("N");
        await using var c = new NpgsqlConnection(admin); await c.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {database}", c); await command.ExecuteNonQueryAsync();
        b.Database = database; ConnectionString = b.ConnectionString;
    }
    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        if (database.Length == 0) return;
        await using var c = new NpgsqlConnection(admin); await c.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE {database} WITH (FORCE)", c); await command.ExecuteNonQueryAsync();
    }
}
