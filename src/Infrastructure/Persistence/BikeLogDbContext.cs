using Microsoft.EntityFrameworkCore;
using BikeLog.Domain.Bikes; using BikeLog.Domain.Components; using BikeLog.Domain.Installations; using BikeLog.Domain.Rides; using BikeLog.Domain.Maintenance;
namespace BikeLog.Infrastructure.Persistence;
public sealed class BikeLogDbContext(DbContextOptions<BikeLogDbContext> options) : DbContext(options)
{
 public DbSet<Bike> Bikes => Set<Bike>(); public DbSet<Component> Components => Set<Component>(); public DbSet<Installation> Installations=>Set<Installation>(); public DbSet<Ride> Rides=>Set<Ride>(); public DbSet<MaintenanceRecord> MaintenanceRecords=>Set<MaintenanceRecord>();
 public DbSet<ComponentUsageRow> ComponentUsages=>Set<ComponentUsageRow>(); public DbSet<InstallationUsageRow> InstallationUsages=>Set<InstallationUsageRow>();
 protected override void OnModelCreating(ModelBuilder b) => b.ApplyConfigurationsFromAssembly(typeof(BikeLogDbContext).Assembly);
}
