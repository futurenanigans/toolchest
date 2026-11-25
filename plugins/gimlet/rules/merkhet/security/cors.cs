using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Merkhet.Tests.Cors;

public class CorsPolicyExamples
{
    public void ConfigureCors(IServiceCollection services)
    {
        services.AddCors(options =>
        {
            options.AddPolicy("insecure", builder =>
            {
                // ruleid: merk.security.cors-wildcard-aspnet-csharp, merk.security.cors-wildcard-origin-aspnet-csharp
                builder.AllowAnyOrigin()
                       .AllowAnyMethod()
                       .AllowCredentials();
            });

            options.AddPolicy("openApi", builder =>
            {
                // ruleid: merk.security.cors-wildcard-origin-aspnet-csharp
                builder.AllowAnyOrigin()
                       .AllowAnyMethod();
            });

            options.AddPolicy("safe", builder =>
            {
                // ok: merk.security.cors-wildcard-origin-aspnet-csharp
                builder.WithOrigins("https://app.example.com")
                       .AllowCredentials();
            });
        });
    }
}
