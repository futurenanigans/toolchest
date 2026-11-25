using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;

public class MustBeAdminRequirement : IAuthorizationRequirement {}

public class AlwaysAllowHandler : AuthorizationHandler<MustBeAdminRequirement>
{
    // ruleid: gimlet.security.aspnet-authz-unconditional-succeed-csharp
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MustBeAdminRequirement requirement)
    {
        context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

public class CatchSucceedHandler : AuthorizationHandler<MustBeAdminRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MustBeAdminRequirement requirement)
    {
        // ruleid: gimlet.security.aspnet-authz-succeed-in-catch-csharp
        try
        {
            var role = context.User.FindFirst("role");
            if (role?.Value == "admin")
            {
                context.Succeed(requirement);
            }
        }
        catch
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}

public class LegitimateHandler : AuthorizationHandler<MustBeAdminRequirement>
{
    // ok: gimlet.security.aspnet-authz-unconditional-succeed-csharp
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MustBeAdminRequirement requirement)
    {
        var role = context.User.FindFirst("role");
        if (role?.Value == "admin")
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}
