using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BikeLog.Api.Operations;

public static class PilotUserCommands
{
    public static void ValidateTarget(
        BikeLogDbContext db,
        IConfiguration configuration,
        string environmentName,
        string issuer
    )
    {
        if (
            environmentName != Environments.Development
            || configuration["AccessMode"] != "Authenticated"
            || configuration.GetValue<bool>("LocalSyntheticMode")
            || issuer != configuration["Auth:Issuer"]
        )
        {
            throw new InvalidOperationException(
                "Pilot user commands require the configured authenticated development issuer."
            );
        }
        LocalDatabaseGuard.Validate(db, configuration);
    }

    public static async Task<Guid> ProvisionAsync(
        BikeLogDbContext db,
        string issuer,
        string subject,
        string email,
        CancellationToken ct
    )
    {
        if (
            !Uri.TryCreate(issuer, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || string.IsNullOrWhiteSpace(subject)
            || string.IsNullOrWhiteSpace(email)
            || !System.Net.Mail.MailAddress.TryCreate(email, out _)
        )
        {
            throw new InvalidOperationException(
                "A HTTPS issuer, subject, and confirmed email are required."
            );
        }
        if (await db.BikeLogUsers.AnyAsync(x => x.Issuer == issuer && x.Subject == subject, ct))
        {
            throw new InvalidOperationException("The external identity is already provisioned.");
        }

        var ownerId = Guid.NewGuid();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.BikeLogUsers.Add(
            new BikeLogUser
            {
                OwnerId = ownerId,
                Issuer = issuer,
                Subject = subject,
                Email = email,
                Enabled = true,
            }
        );
        try
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            throw new InvalidOperationException(
                "The external identity or owner is already provisioned.",
                ex
            );
        }
        return ownerId;
    }

    public static async Task SetEnabledAsync(
        BikeLogDbContext db,
        Guid ownerId,
        bool enabled,
        CancellationToken ct
    )
    {
        if (ownerId == Guid.Empty)
        {
            throw new InvalidOperationException("A nonempty internal owner ID is required.");
        }
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user =
            await db.BikeLogUsers.SingleOrDefaultAsync(x => x.OwnerId == ownerId, ct)
            ?? throw new InvalidOperationException("Pilot user not found.");
        user.Enabled = enabled;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }
}
