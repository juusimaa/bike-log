using Npgsql;

namespace BikeLog.Api.Operations;

public enum OperatorTarget
{
    Local,
    Hosted,
}

/// <summary>
/// Decides which database operator commands may write to, before any connection is opened.
/// Development may target only the dedicated loopback database; Production may target only
/// the configured hosted host over verified TLS (research D6). Everything else is refused.
/// </summary>
public static class OperatorTargetGuard
{
    public static OperatorTarget Validate(
        IConfiguration configuration,
        IHostEnvironment environment,
        string connectionString
    )
    {
        if (environment.IsDevelopment())
        {
            ValidateLocal(configuration, connectionString);
            return OperatorTarget.Local;
        }
        if (!environment.IsProduction())
        {
            throw new InvalidOperationException(
                "Operator commands run only in Development or Production."
            );
        }
        if (
            configuration["AccessMode"] != "Authenticated"
            || configuration.GetValue<bool>("LocalSyntheticMode")
        )
        {
            throw new InvalidOperationException(
                "Hosted operator commands require Authenticated mode without LocalSyntheticMode."
            );
        }
        var actual = new NpgsqlConnectionStringBuilder(connectionString);
        if (actual.SslMode != SslMode.VerifyFull)
        {
            throw new InvalidOperationException(
                "Hosted operator commands require SSL Mode=VerifyFull."
            );
        }
        if (string.IsNullOrWhiteSpace(actual.RootCertificate))
        {
            throw new InvalidOperationException(
                "Hosted operator commands require a root certificate."
            );
        }
        var hostedHost = configuration["Operator:HostedDatabaseHost"];
        if (string.IsNullOrWhiteSpace(hostedHost))
        {
            throw new InvalidOperationException(
                "Hosted operator commands require Operator:HostedDatabaseHost."
            );
        }
        if (!string.Equals(actual.Host, hostedHost, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "The database host does not match Operator:HostedDatabaseHost."
            );
        }
        RequireConfigured(configuration, actual);
        return OperatorTarget.Hosted;
    }

    public static void ValidateLocal(IConfiguration configuration, string connectionString)
    {
        var actual = new NpgsqlConnectionStringBuilder(connectionString);
        var databaseName = actual.Database ?? "";
        if (
            actual.Host != "127.0.0.1"
            || actual.Port != 54329
            || !(
                databaseName == "bikelog_dev"
                || databaseName.StartsWith("bikelog_test_", StringComparison.Ordinal)
            )
        )
        {
            throw new InvalidOperationException(
                "Operator commands require the configured dedicated loopback PostgreSQL database."
            );
        }
        RequireConfigured(configuration, actual);
    }

    private static void RequireConfigured(
        IConfiguration configuration,
        NpgsqlConnectionStringBuilder actual
    )
    {
        var configured = new NpgsqlConnectionStringBuilder(
            configuration.GetConnectionString("Postgres") ?? ""
        );
        if (actual.ConnectionString != configured.ConnectionString)
        {
            throw new InvalidOperationException(
                "Operator commands require the configured database connection."
            );
        }
    }
}
