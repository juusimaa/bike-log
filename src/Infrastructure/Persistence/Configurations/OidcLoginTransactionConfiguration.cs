using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class OidcLoginTransactionConfiguration
    : IEntityTypeConfiguration<OidcLoginTransaction>
{
    public void Configure(EntityTypeBuilder<OidcLoginTransaction> b)
    {
        b.HasKey(x => x.StateHash);
        b.Property(x => x.StateHash).HasMaxLength(64);
        b.Property(x => x.EncryptedNonceAndVerifier).IsRequired();
        b.Property(x => x.ReturnPath).HasMaxLength(2048).IsRequired();
        b.HasIndex(x => x.ExpiresAtUtc);
    }
}
