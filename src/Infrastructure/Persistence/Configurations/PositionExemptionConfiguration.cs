using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class PositionExemptionConfiguration : IEntityTypeConfiguration<PositionExemption>
{
    public void Configure(EntityTypeBuilder<PositionExemption> b)
    {
        EntityConfiguration.Common(b);
        b.Property(x => x.Position).HasConversion<string>();
        b.Property(x => x.Reason).HasConversion<string>();
        b.HasOne<Bike>()
            .WithMany()
            .HasForeignKey(x => new { x.OwnerId, x.BikeId })
            .HasPrincipalKey(x => new { x.OwnerId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new
        {
            x.OwnerId,
            x.BikeId,
            x.Position,
            x.StartUtc,
        });
        var allowed = string.Join(
            ", ",
            ComponentCatalog
                .Entries.Where(x => x.Exemption.HasValue)
                .Select(x => $"('{x.Position}', '{x.Exemption}')")
        );
        b.ToTable(
            "PositionExemptions",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_PositionExemption_Interval",
                    "\"EndUtc\" IS NULL OR \"EndUtc\" > \"StartUtc\""
                );
                t.HasCheckConstraint(
                    "CK_PositionExemption_Reason",
                    $"(\"Position\", \"Reason\") IN ({allowed})"
                );
            }
        );
    }
}
