using BikeLog.Domain.Components;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class ComponentConfiguration : IEntityTypeConfiguration<Component>
{
    public void Configure(EntityTypeBuilder<Component> b)
    {
        EntityConfiguration.Common(b);
        b.Property(x => x.Model).IsRequired();
        b.Property(x => x.Type).HasConversion<string>();
        b.ToTable("Components", t => t.HasCheckConstraint("CK_Component_Type", "\"Type\" = 'Chain'"));
    }
}
