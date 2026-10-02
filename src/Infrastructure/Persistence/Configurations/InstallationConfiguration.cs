using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class InstallationConfiguration : IEntityTypeConfiguration<Installation>
{
    public void Configure(EntityTypeBuilder<Installation> b)
    {
        EntityConfiguration.Common(b);
        b.Property(x => x.Position).HasConversion<string>();
        b.HasOne<Bike>()
            .WithMany()
            .HasForeignKey(x => new { x.OwnerId, x.BikeId })
            .HasPrincipalKey(x => new { x.OwnerId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Component>()
            .WithMany()
            .HasForeignKey(x => new { x.OwnerId, x.ComponentId })
            .HasPrincipalKey(x => new { x.OwnerId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new
        {
            x.OwnerId,
            x.BikeId,
            x.StartUtc,
        });
        b.ToTable(
            "Installations",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Installation_Interval",
                    "\"EndUtc\" IS NULL OR \"EndUtc\" > \"StartUtc\""
                );
                t.HasCheckConstraint(
                    "CK_Installation_Position",
                    "\"Position\" IN ('Chain', 'Cassette', 'FrontTyre', 'RearTyre')"
                );
            }
        );
    }
}
