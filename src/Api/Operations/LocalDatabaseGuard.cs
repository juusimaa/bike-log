using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BikeLog.Api.Operations;

internal static class LocalDatabaseGuard
{
    public static void Validate(BikeLogDbContext db, IConfiguration configuration)
    {
        var actual = new NpgsqlConnectionStringBuilder(db.Database.GetConnectionString() ?? "");
        var configured = new NpgsqlConnectionStringBuilder(
            configuration.GetConnectionString("Postgres") ?? ""
        );
        var databaseName = actual.Database ?? "";
        if (
            actual.Host != "127.0.0.1"
            || actual.Port != 54329
            || !(
                databaseName == "bikelog_dev"
                || databaseName.StartsWith("bikelog_test_", StringComparison.Ordinal)
            )
            || actual.ConnectionString != configured.ConnectionString
        )
        {
            throw new InvalidOperationException(
                "Operator commands require the configured dedicated loopback PostgreSQL database."
            );
        }
    }
}
