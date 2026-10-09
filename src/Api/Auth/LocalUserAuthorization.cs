using BikeLog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Auth;

public sealed class LocalUserRequirement : IAuthorizationRequirement;

public sealed class LocalUserAuthorization(BikeLogDbContext db, CurrentOwner owner)
    : AuthorizationHandler<LocalUserRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        LocalUserRequirement requirement
    )
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            return;
        }

        var subject = context.User.FindFirst("sub")?.Value;
        var issuer = context.User.FindFirst("bikelog:validated_issuer")?.Value;
        if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(issuer))
        {
            return;
        }

        var user = await db
            .BikeLogUsers.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Issuer == issuer && x.Subject == subject && x.Enabled);
        if (user is null)
        {
            return;
        }

        owner.Set(user.OwnerId);
        context.Succeed(requirement);
    }
}
