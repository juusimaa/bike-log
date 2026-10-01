using System.Buffers.Binary;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
namespace BikeLog.Infrastructure.Persistence;

public sealed class OwnerMutation(BikeLogDbContext db, UsageRebuilder rebuilder)
{
    public async Task<T> ExecuteAsync<T>(Guid ownerId, Func<CancellationToken, Task<T>> mutation, bool recalculate, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var key = BinaryPrimitives.ReadInt64LittleEndian(SHA256.HashData(ownerId.ToByteArray()));
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})", ct);
        var result = await mutation(ct); await db.SaveChangesAsync(ct);
        if (recalculate) await rebuilder.RebuildAsync(ownerId, ct);
        await transaction.CommitAsync(ct); return result;
    }
}
