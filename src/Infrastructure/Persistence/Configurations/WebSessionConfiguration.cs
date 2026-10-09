using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class WebSessionConfiguration : IEntityTypeConfiguration<WebSession>
{
    public void Configure(EntityTypeBuilder<WebSession> b)
    {
        b.HasKey(x => x.SessionIdHash);
        b.Property(x => x.SessionIdHash).HasMaxLength(64);
        b.Property(x => x.EncryptedTokens).IsRequired();
        b.Property(x => x.Issuer).HasMaxLength(512).IsRequired();
        b.Property(x => x.Subject).HasMaxLength(512).IsRequired();
        b.HasIndex(x => x.ExpiresAtUtc);
        b.HasIndex(x => new { x.Issuer, x.Subject });
    }
}
