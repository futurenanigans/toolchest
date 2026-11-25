using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

public class AccountService
{
    private readonly SignInManager<IdentityUser> _signInManager;

    public AccountService(SignInManager<IdentityUser> signInManager) => _signInManager = signInManager;

    public async Task<SignInResult> LoginNamed(string email, string password, bool remember)
    {
        // ruleid: gimlet.security.identity-lockout-disabled-csharp
        return await _signInManager.PasswordSignInAsync(email, password, remember, lockoutOnFailure: false);
    }

    public async Task<SignInResult> LoginPositional(string email, string password)
    {
        // ruleid: gimlet.security.identity-lockout-disabled-csharp
        return await _signInManager.PasswordSignInAsync(email, password, false, false);
    }

    public async Task<SignInResult> CheckOnly(IdentityUser user, string password)
    {
        // ruleid: gimlet.security.identity-lockout-disabled-csharp
        return await _signInManager.CheckPasswordSignInAsync(user, password, false);
    }

    public async Task<SignInResult> LoginSafe(string email, string password, bool remember)
    {
        // ok: gimlet.security.identity-lockout-disabled-csharp
        return await _signInManager.PasswordSignInAsync(email, password, remember, lockoutOnFailure: true);
    }

    public async Task<SignInResult> LoginSafePositional(string email, string password)
    {
        // ok: gimlet.security.identity-lockout-disabled-csharp
        return await _signInManager.PasswordSignInAsync(email, password, false, true);
    }

    public async Task<SignInResult> CheckSafe(IdentityUser user, string password)
    {
        // ok: gimlet.security.identity-lockout-disabled-csharp
        return await _signInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
    }
}

public static class IdentitySetup
{
    public static void Weak(IServiceCollection services)
    {
        services.AddIdentity<IdentityUser, IdentityRole>(options =>
        {
            // ruleid: gimlet.security.identity-lockout-disabled-csharp
            options.Lockout.AllowedForNewUsers = false;
            // ruleid: gimlet.security.identity-lockout-threshold-csharp
            options.Lockout.MaxFailedAccessAttempts = 50;
            // ruleid: gimlet.security.identity-weak-password-policy-csharp
            options.Password.RequiredLength = 4;
        });

        services.Configure<IdentityOptions>(o =>
        {
            // ruleid: gimlet.security.identity-lockout-threshold-csharp
            o.Lockout.MaxFailedAccessAttempts = 11;
            // ruleid: gimlet.security.identity-weak-password-policy-csharp
            o.Password.RequiredLength = 6;
        });

        services.Configure<IdentityOptions>(o =>
        {
            // ruleid: gimlet.security.identity-lockout-threshold-csharp
            o.Lockout.MaxFailedAccessAttempts = 1000;
            // ruleid: gimlet.security.identity-weak-password-policy-csharp
            o.Password.RequireDigit = false;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequireUppercase = false;
            o.Password.RequireLowercase = false;
        });
    }

    public static void Strong(IServiceCollection services)
    {
        services.AddIdentity<IdentityUser, IdentityRole>(options =>
        {
            // ok: gimlet.security.identity-lockout-disabled-csharp
            options.Lockout.AllowedForNewUsers = true;
            // ok: gimlet.security.identity-lockout-threshold-csharp
            options.Lockout.MaxFailedAccessAttempts = 5;
            // ok: gimlet.security.identity-weak-password-policy-csharp
            options.Password.RequiredLength = 8;
        });

        services.Configure<IdentityOptions>(o =>
        {
            // ok: gimlet.security.identity-lockout-threshold-csharp
            o.Lockout.MaxFailedAccessAttempts = 10;
            // ok: gimlet.security.identity-weak-password-policy-csharp
            o.Password.RequiredLength = 12;
        });

        services.Configure<IdentityOptions>(o =>
        {
            // ok: gimlet.security.identity-lockout-threshold-csharp
            o.Lockout.MaxFailedAccessAttempts = 3;
            o.Password.RequiredLength = 16;
            // ok: gimlet.security.identity-weak-password-policy-csharp
            o.Password.RequireDigit = false;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequireUppercase = false;
            o.Password.RequireLowercase = false;
        });

        services.Configure<IdentityOptions>(o =>
        {
            // ok: gimlet.security.identity-weak-password-policy-csharp
            o.Password.RequireDigit = false;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequireUppercase = true;
            o.Password.RequireLowercase = true;
        });
    }
}
