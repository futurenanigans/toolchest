using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Gimlet.Tests.Cors;

public class CorsPolicyExamples
{
    public void ConfigureCors(IServiceCollection services)
    {
        services.AddCors(options =>
        {
            options.AddPolicy("insecure", builder =>
            {
                // ruleid: gimlet.security.cors-wildcard-aspnet-csharp, gimlet.security.cors-wildcard-origin-aspnet-csharp
                builder.AllowAnyOrigin()
                       .AllowAnyMethod()
                       .AllowCredentials();
            });

            options.AddPolicy("openApi", builder =>
            {
                // ruleid: gimlet.security.cors-wildcard-origin-aspnet-csharp
                builder.AllowAnyOrigin()
                       .AllowAnyMethod();
            });

            options.AddPolicy("safe", builder =>
            {
                // ok: gimlet.security.cors-wildcard-origin-aspnet-csharp
                builder.WithOrigins("https://app.example.com")
                       .AllowCredentials();
            });
        });
    }
}
