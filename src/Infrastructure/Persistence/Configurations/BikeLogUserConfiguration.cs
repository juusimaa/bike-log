using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class BikeLogUserConfiguration : IEntityTypeConfiguration<BikeLogUser>
{
    public void Configure(EntityTypeBuilder<BikeLogUser> b)
    {
        b.HasKey(x => x.OwnerId);
        b.Property(x => x.OwnerId).ValueGeneratedNever();
        b.Property(x => x.Issuer).HasMaxLength(512).IsRequired();
        b.Property(x => x.Subject).HasMaxLength(512).IsRequired();
        b.Property(x => x.Email).HasMaxLength(320);
        b.Property(x => x.DisplayName).HasMaxLength(200);
        b.HasIndex(x => new { x.Issuer, x.Subject }).IsUnique();
    }
}
