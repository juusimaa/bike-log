using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Reminders;
using BikeLog.Domain.Rides;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Infrastructure.Persistence;

public sealed class BikeLogDbContext(DbContextOptions<BikeLogDbContext> options)
    : DbContext(options)
{
    public DbSet<ChainLubricationRule> ChainLubricationRules => Set<ChainLubricationRule>();
    public DbSet<Bike> Bikes => Set<Bike>();
    public DbSet<Component> Components => Set<Component>();
    public DbSet<Installation> Installations => Set<Installation>();
    public DbSet<Ride> Rides => Set<Ride>();
    public DbSet<MaintenanceRecord> MaintenanceRecords => Set<MaintenanceRecord>();
    public DbSet<ComponentUsageRow> ComponentUsages => Set<ComponentUsageRow>();
    public DbSet<InstallationUsageRow> InstallationUsages => Set<InstallationUsageRow>();
    public DbSet<BikeLogUser> BikeLogUsers => Set<BikeLogUser>();
    public DbSet<WebSession> WebSessions => Set<WebSession>();
    public DbSet<OidcLoginTransaction> OidcLoginTransactions => Set<OidcLoginTransaction>();

    protected override void OnModelCreating(ModelBuilder b) =>
        b.ApplyConfigurationsFromAssembly(typeof(BikeLogDbContext).Assembly);
}
