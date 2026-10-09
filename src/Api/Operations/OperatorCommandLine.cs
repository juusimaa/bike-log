using BikeLog.Api.Auth;
using BikeLog.Infrastructure.Persistence;

namespace BikeLog.Api.Operations;

public static class OperatorCommandLine
{
    public static void ValidateRebuild(AccessMode mode, string[] args)
    {
        if (mode != AccessMode.Synthetic || args.Length != 1 || args[0] != "--rebuild-usage")
        {
            throw new InvalidOperationException(
                "Usage rebuild is restricted to local synthetic mode."
            );
        }
    }

    private static readonly HashSet<string> Commands =
    [
        "--provision-pilot-user",
        "--disable-pilot-user",
        "--enable-pilot-user",
        "--purge-synthetic-owner",
    ];

    public static async Task<bool> TryExecuteAsync(WebApplication app, string[] args)
    {
        if (args.Length == 0 || !Commands.Contains(args[0]))
        {
            return false;
        }
        if (args.Count(Commands.Contains) != 1)
        {
            throw new InvalidOperationException("Exactly one operator command is allowed.");
        }

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<BikeLogDbContext>();
        var command = args[0];
        if (command == "--purge-synthetic-owner")
        {
            var confirmationCount = args.Count(x => x == "--confirm-delete-synthetic");
            if (confirmationCount > 1)
            {
                throw new InvalidOperationException(
                    "The purge confirmation flag must appear once."
                );
            }
            var confirmed = confirmationCount == 1;
            var options = ReadOptions(
                args.Where(x => x != "--confirm-delete-synthetic").ToArray(),
                "--owner"
            );
            var owner = RequireOwner(options);
            var result = await SyntheticOwnerPurge.PurgeAsync(
                db,
                app.Configuration,
                app.Environment.EnvironmentName,
                owner,
                confirmed,
                CancellationToken.None
            );
            Console.WriteLine(
                $"Synthetic purge complete: {result.Bikes} bikes, {result.Components} components, {result.Rides} rides, {result.Installations} installations, {result.MaintenanceRecords} maintenance records, {result.ReminderRules} reminder rules, {result.ComponentUsages} component usages, {result.InstallationUsages} installation usages."
            );
            return true;
        }

        PilotUserCommands.ValidateTarget(
            db,
            app.Configuration,
            app.Environment.EnvironmentName,
            app.Configuration["Auth:Issuer"] ?? ""
        );
        if (command == "--provision-pilot-user")
        {
            var options = ReadOptions(args, "--issuer", "--subject", "--email");
            var issuer = options["--issuer"];
            PilotUserCommands.ValidateTarget(
                db,
                app.Configuration,
                app.Environment.EnvironmentName,
                issuer
            );
            var owner = await PilotUserCommands.ProvisionAsync(
                db,
                issuer,
                options["--subject"],
                options["--email"],
                CancellationToken.None
            );
            Console.WriteLine($"Provisioned pilot owner {owner:D}.");
            return true;
        }

        var ownerId = RequireOwner(ReadOptions(args, "--owner"));
        var enabled = command == "--enable-pilot-user";
        await PilotUserCommands.SetEnabledAsync(db, ownerId, enabled, CancellationToken.None);
        Console.WriteLine($"Pilot owner {ownerId:D} {(enabled ? "enabled" : "disabled")}.");
        return true;
    }

    private static Guid RequireOwner(IReadOnlyDictionary<string, string> options)
    {
        if (!Guid.TryParseExact(options["--owner"], "D", out var owner) || owner == Guid.Empty)
        {
            throw new InvalidOperationException(
                "An exact nonempty internal owner UUID is required."
            );
        }
        return owner;
    }

    private static Dictionary<string, string> ReadOptions(string[] args, params string[] required)
    {
        if (args.Length != 1 + required.Length * 2)
        {
            throw new InvalidOperationException(
                "The operator command has missing or unexpected options."
            );
        }
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 1; i < args.Length; i += 2)
        {
            if (
                !required.Contains(args[i], StringComparer.Ordinal)
                || args[i + 1].StartsWith("--", StringComparison.Ordinal)
                || !options.TryAdd(args[i], args[i + 1])
            )
            {
                throw new InvalidOperationException(
                    "The operator command has an invalid or duplicate option."
                );
            }
        }
        return options;
    }
}
