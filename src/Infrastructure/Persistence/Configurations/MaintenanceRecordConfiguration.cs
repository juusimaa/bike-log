using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class MaintenanceRecordConfiguration : IEntityTypeConfiguration<MaintenanceRecord>
{
    public void Configure(EntityTypeBuilder<MaintenanceRecord> b)
    {
        EntityConfiguration.Common(b);
        b.Property(x => x.Task).IsRequired();
        b.Property(x => x.Cost).HasPrecision(18, 2);
        b.HasOne<Bike>().WithMany().HasForeignKey(x => new { x.OwnerId, x.BikeId }).HasPrincipalKey(x => new { x.OwnerId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Component>().WithMany().HasForeignKey(x => new { x.OwnerId, x.ComponentId }).HasPrincipalKey(x => new { x.OwnerId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.OwnerId, x.BikeId, x.PerformedUtc });
        b.ToTable("MaintenanceRecords", t => t.HasCheckConstraint("CK_Maintenance_Cost", "(\"Cost\" IS NULL AND \"Currency\" IS NULL) OR (\"Cost\" IS NOT NULL AND \"Cost\" >= 0 AND \"Currency\" ~ '^[A-Z]{3}$')"));
    }
}
