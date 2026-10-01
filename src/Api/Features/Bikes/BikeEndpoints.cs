using Microsoft.EntityFrameworkCore; using BikeLog.Infrastructure.Persistence; using BikeLog.Api.Development; using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Bikes;
namespace BikeLog.Api.Features.Bikes;
public static class BikeEndpoints
{
 public static void MapBikes(this RouteGroupBuilder api)
 {
  api.MapPost("/bikes",async(CreateBike request,BikeLogDbContext db,OwnerMutation mutation,IDevelopmentOwner owner,CancellationToken ct)=>{
   var bike=await mutation.ExecuteAsync(owner.OwnerId,_=>{var b=new Bike{OwnerId=owner.OwnerId,Name=ApiInput.Text(request.Name,"name")};db.Bikes.Add(b);return Task.FromResult(b);},false,ct);
   return Results.Created($"/api/bikes/{bike.Id}",new BikeResponse(bike.Id,bike.Name,bike.Version));
  }).WithDescription("Create a synthetic bike. Owner is supplied by the local development host.");
  api.MapGet("/bikes/{id:guid}",async(Guid id,BikeLogDbContext db,IDevelopmentOwner owner,CancellationToken ct)=>{
   var b=await db.Bikes.AsNoTracking().SingleOrDefaultAsync(x=>x.OwnerId==owner.OwnerId&&x.Id==id,ct)??throw ApiInput.Missing();return new BikeResponse(b.Id,b.Name,b.Version);
  });
 }
}
