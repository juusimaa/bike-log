using BikeLog.Domain;
using BikeLog.Domain.Components;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal static class EntityConfiguration
{
    public static void Common<T>(EntityTypeBuilder<T> b)
        where T : Entity
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.HasAlternateKey(x => new { x.OwnerId, x.Id });
        b.Property(x => x.Version).IsConcurrencyToken();
        b.HasIndex(x => x.OwnerId);
    }

    /// <summary>SQL list of stored enum names for a check constraint.</summary>
    public static string Names<TEnum>()
        where TEnum : struct, Enum =>
        string.Join(", ", Enum.GetNames<TEnum>().Select(x => $"'{x}'"));

    public static string Weight(string column) =>
        $"\"{column}\" IS NULL OR \"{column}\" BETWEEN 1 AND {ComponentWeight.MaxGrams}";
}
