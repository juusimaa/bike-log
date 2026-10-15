using BikeLog.Domain.Bikes;
using BikeLog.Domain.Rides;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class RideConfiguration : IEntityTypeConfiguration<Ride>
{
    public void Configure(EntityTypeBuilder<Ride> b)
    {
        EntityConfiguration.Common(b);
        b.HasOne<Bike>()
            .WithMany()
            .HasForeignKey(x => new { x.OwnerId, x.BikeId })
            .HasPrincipalKey(x => new { x.OwnerId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new
        {
            x.OwnerId,
            x.BikeId,
            x.StartUtc,
        });
        // All rides lists the owner's rides across bikes, newest first.
        b.HasIndex(x => new
        {
            x.OwnerId,
            x.StartUtc,
            x.Id,
        });
        b.ToTable(
            "Rides",
            t =>
            {
                t.HasCheckConstraint("CK_Ride_Distance", "\"DistanceMetres\" > 0");
                t.HasCheckConstraint(
                    "CK_Ride_Duration",
                    "\"DurationSeconds\" IS NULL OR \"DurationSeconds\" > 0"
                );
            }
        );
    }
}
