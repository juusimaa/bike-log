using BikeLog.Domain.Usage; using Microsoft.EntityFrameworkCore;
namespace BikeLog.Infrastructure.Persistence;
public sealed class UsageRebuilder(BikeLogDbContext db,IUsageCalculator calculator)
{
 public async Task RebuildAsync(Guid ownerId,CancellationToken ct)
 {
  var rides=await db.Rides.AsNoTracking().Where(x=>x.OwnerId==ownerId).ToListAsync(ct);
  var installations=await db.Installations.AsNoTracking().Where(x=>x.OwnerId==ownerId).ToListAsync(ct);
  var result=calculator.Calculate(rides,installations);var now=DateTimeOffset.UtcNow;
  await db.ComponentUsages.Where(x=>x.OwnerId==ownerId).ExecuteDeleteAsync(ct);
  await db.InstallationUsages.Where(x=>x.OwnerId==ownerId).ExecuteDeleteAsync(ct);
  // Previous projection objects may be tracked by a caller; remove them before re-inserting their keys.
  foreach(var entry in db.ChangeTracker.Entries().Where(x=>x.Entity is ComponentUsageRow or InstallationUsageRow).ToArray())entry.State=EntityState.Detached;
  db.ComponentUsages.AddRange(result.ComponentUsages.Select(x=>new ComponentUsageRow{OwnerId=ownerId,ComponentId=x.ComponentId,LifetimeMetres=x.LifetimeMetres,LifetimeSeconds=x.LifetimeSeconds,HasUnknownDuration=x.HasUnknownDuration,CalculatedAtUtc=now}));
  db.InstallationUsages.AddRange(result.InstallationUsages.Select(x=>new InstallationUsageRow{OwnerId=ownerId,InstallationId=x.InstallationId,Metres=x.Metres,Seconds=x.Seconds,HasUnknownDuration=x.HasUnknownDuration,CalculatedAtUtc=now}));
  await db.SaveChangesAsync(ct);
 }
}
