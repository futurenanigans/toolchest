// License: MIT
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

class Startup
{
    void ConfigureServices(IServiceCollection services)
    {
        services.Configure<IdentityOptions>(options =>
        {
            // ruleid: csharp_password_rule-PasswordComplexity
            options.Password.RequireDigit = false;
            // ruleid: csharp_password_rule-PasswordComplexity
            options.Password.RequireNonAlphanumeric = false;
            // ruleid: csharp_password_rule-PasswordComplexity
            options.Password.RequiredLength = 6;
            // ruleid: csharp_password_rule-PasswordComplexity
            options.Password.RequiredUniqueChars = 0;
            // ok: csharp_password_rule-PasswordComplexity
            options.Password.RequireUppercase = true;
            // ok: csharp_password_rule-PasswordComplexity
            options.Password.RequiredLength = 12;
            // ok: csharp_password_rule-PasswordComplexity
            options.Password.RequiredUniqueChars = 4;
        });
    }
}
