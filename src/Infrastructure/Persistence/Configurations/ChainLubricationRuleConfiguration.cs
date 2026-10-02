using BikeLog.Domain.Bikes;
using BikeLog.Domain.Reminders;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BikeLog.Infrastructure.Persistence.Configurations;

internal sealed class ChainLubricationRuleConfiguration
    : IEntityTypeConfiguration<ChainLubricationRule>
{
    public void Configure(EntityTypeBuilder<ChainLubricationRule> b)
    {
        EntityConfiguration.Common(b);
        b.Property(x => x.Method).HasConversion<string>();
        b.Ignore(x => x.IsConfigured);
        b.HasIndex(x => new { x.OwnerId, x.BikeId }).IsUnique();
        b.HasOne<Bike>()
            .WithMany()
            .HasForeignKey(x => new { x.OwnerId, x.BikeId })
            .HasPrincipalKey(x => new { x.OwnerId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
        b.ToTable(
            "ChainLubricationRules",
            t =>
            {
                t.HasCheckConstraint(
                    "CK_Reminder_Method",
                    "\"Method\" IS NULL OR \"Method\" IN ('Oil','Wax')"
                );
                t.HasCheckConstraint(
                    "CK_Reminder_Thresholds",
                    "(\"OilThresholdMetres\" IS NULL OR \"OilThresholdMetres\" BETWEEN 1000 AND 10000000) AND (\"WaxThresholdMetres\" IS NULL OR \"WaxThresholdMetres\" BETWEEN 1000 AND 10000000)"
                );
                t.HasCheckConstraint(
                    "CK_Reminder_Enabled",
                    "NOT \"Enabled\" OR (\"Method\" IS NOT NULL AND \"OilThresholdMetres\" IS NOT NULL AND \"WaxThresholdMetres\" IS NOT NULL)"
                );
            }
        );
    }
}
