using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class ComponentUsageConfiguration : IEntityTypeConfiguration<ComponentUsageRow>
{ public void Configure(EntityTypeBuilder<ComponentUsageRow> b) { b.HasKey(x => x.ComponentId); b.Property(x => x.ComponentId).ValueGeneratedNever(); b.HasOne<Component>().WithOne().HasForeignKey<ComponentUsageRow>(x => new { x.OwnerId, x.ComponentId }).HasPrincipalKey<Component>(x => new { x.OwnerId, x.Id }).OnDelete(DeleteBehavior.Cascade); } }
internal sealed class InstallationUsageConfiguration : IEntityTypeConfiguration<InstallationUsageRow>
{ public void Configure(EntityTypeBuilder<InstallationUsageRow> b) { b.HasKey(x => x.InstallationId); b.Property(x => x.InstallationId).ValueGeneratedNever(); b.HasOne<Installation>().WithOne().HasForeignKey<InstallationUsageRow>(x => new { x.OwnerId, x.InstallationId }).HasPrincipalKey<Installation>(x => new { x.OwnerId, x.Id }).OnDelete(DeleteBehavior.Cascade); } }
