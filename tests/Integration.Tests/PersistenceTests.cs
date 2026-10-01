using BikeLog.Integration.Tests.Fixtures; using BikeLog.Domain.Bikes; using BikeLog.Domain.Components; using BikeLog.Domain.Installations; using Microsoft.EntityFrameworkCore;
namespace BikeLog.Integration.Tests;
public class PersistenceTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
 [Fact] public async Task MigrationsCreateUsableSchema()
 {await using var db=TestDatabase.Open(fixture.ConnectionString);await db.Database.MigrateAsync();var owner=Guid.NewGuid();var bike=new Bike {OwnerId=owner,Name="Synthetic"};var chain=new Component {OwnerId=owner,Model="Chain"};var i=new Installation {OwnerId=owner,BikeId=bike.Id,ComponentId=chain.Id,StartUtc=DateTimeOffset.UtcNow};db.AddRange(bike,chain,i);await db.SaveChangesAsync();db.ChangeTracker.Clear();Assert.Equal(chain.Id,(await db.Installations.SingleAsync(x=>x.Id==i.Id)).ComponentId);}
 [Fact] public async Task RejectsCrossOwnerRelationships()
 {await using var db=TestDatabase.Open(fixture.ConnectionString);await db.Database.MigrateAsync();var bike=new Bike {OwnerId=Guid.NewGuid(),Name="Other"};var chain=new Component {OwnerId=Guid.NewGuid(),Model="Chain"};db.AddRange(bike,chain);await db.SaveChangesAsync();db.Add(new Installation {OwnerId=chain.OwnerId,BikeId=bike.Id,ComponentId=chain.Id,StartUtc=DateTimeOffset.UtcNow});await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());}
}
