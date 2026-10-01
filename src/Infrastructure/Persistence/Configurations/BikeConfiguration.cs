using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class BikeConfiguration : IEntityTypeConfiguration<Bike>
{ public void Configure(EntityTypeBuilder<Bike> b) { EntityConfiguration.Common(b); b.Property(x => x.Name).IsRequired(); } }
