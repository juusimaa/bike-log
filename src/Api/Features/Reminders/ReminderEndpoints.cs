using System.Data;
using BikeLog.Api.Development;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Reminders;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Reminders;

public static class ReminderEndpoints
{
    public static void MapReminders(this RouteGroupBuilder api)
    {
        api.MapGet(
                "/bikes/{id:guid}/reminder",
                async (
                    Guid id,
                    BikeLogDbContext db,
                    ReminderReader reader,
                    IDevelopmentOwner owner,
                    TimeProvider clock,
                    CancellationToken ct
                ) =>
                {
                    var at = clock.GetUtcNow();
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    return await reader.ReadAsync(owner.OwnerId, id, at, ct);
                }
            )
            .Produces<ReminderEvaluation>();
        api.MapPut(
                "/bikes/{id:guid}/reminder",
                async (
                    Guid id,
                    EditReminder request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ReminderReader reader,
                    IDevelopmentOwner owner,
                    TimeProvider clock,
                    CancellationToken ct
                ) =>
                {
                    return await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            if (
                                !await db.Bikes.AnyAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == id,
                                    token
                                )
                            )
                            {
                                throw ApiInput.Missing();
                            }
                            var rule = await db.ChainLubricationRules.SingleOrDefaultAsync(
                                x => x.OwnerId == owner.OwnerId && x.BikeId == id,
                                token
                            );
                            ApiInput.Version(request.ExpectedVersion, rule?.Version ?? 0);
                            var next = new ChainLubricationRule
                            {
                                OwnerId = owner.OwnerId,
                                BikeId = id,
                                Enabled = request.Enabled,
                                Method = request.ParseMethod(),
                                OilThresholdMetres = request.OilThresholdMetres,
                                WaxThresholdMetres = request.WaxThresholdMetres,
                            };
                            next.Validate();
                            if (rule is null)
                            {
                                db.ChainLubricationRules.Add(next);
                            }
                            else
                            {
                                rule.Enabled = next.Enabled;
                                rule.Method = next.Method;
                                rule.OilThresholdMetres = next.OilThresholdMetres;
                                rule.WaxThresholdMetres = next.WaxThresholdMetres;
                                rule.Version = checked(rule.Version + 1);
                            }
                            await db.SaveChangesAsync(token);
                            return await reader.ReadAsync(
                                owner.OwnerId,
                                id,
                                clock.GetUtcNow(),
                                token
                            );
                        },
                        false,
                        ct
                    );
                }
            )
            .Produces<ReminderEvaluation>();
    }
}
