using BikeLog.Domain.Bikes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class BikeConfiguration : IEntityTypeConfiguration<Bike>
{
    public void Configure(EntityTypeBuilder<Bike> b)
    {
        EntityConfiguration.Common(b);
        b.Property(x => x.Name);
        b.Property(x => x.Kind).HasConversion<string>();
        b.Property(x => x.Status)
            .HasConversion<string>()
            .HasDefaultValue(BikeStatus.Active)
            .HasSentinel(BikeStatus.Active)
            .IsRequired();
        b.Property(x => x.DeletedUtc);
        b.Ignore(x => x.IsDeleted);
        // Deleted bikes are tombstones that only name their rides; every lookup hides them unless it
        // opts out with IgnoreQueryFilters (research D3).
        b.HasQueryFilter(x => x.DeletedUtc == null);
        b.ToTable(
            "Bikes",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Bike_FrameWeight",
                    EntityConfiguration.Weight("FrameWeightGrams")
                );
                t.HasCheckConstraint(
                    "CK_Bike_Status",
                    $"\"Status\" IN ({EntityConfiguration.Names<BikeStatus>()})"
                );
            }
        );
    }
}
