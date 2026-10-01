using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BikeLog.Domain;
namespace BikeLog.Infrastructure.Persistence.Configurations;

internal static class EntityConfiguration
{ public static void Common<T>(EntityTypeBuilder<T> b) where T : Entity { b.HasKey(x => x.Id); b.Property(x => x.Id).ValueGeneratedNever(); b.HasAlternateKey(x => new { x.OwnerId, x.Id }); b.Property(x => x.Version).IsConcurrencyToken(); b.HasIndex(x => x.OwnerId); } }
