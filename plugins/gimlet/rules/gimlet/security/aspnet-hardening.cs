using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.All;
            // ruleid: gimlet.security.forwarded-headers-trust-all-csharp
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });

        var fh = new ForwardedHeadersOptions();
        // ruleid: gimlet.security.forwarded-headers-trust-all-csharp
        fh.KnownProxies.Clear();
        fh.ForwardLimit = 2;
        fh.KnownNetworks.Clear();

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            // ruleid: gimlet.security.forwarded-headers-trust-all-csharp
            o.KnownProxies.Clear();
            o.KnownNetworks.Clear();
        });

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            // ok: gimlet.security.forwarded-headers-trust-all-csharp
            o.KnownProxies.Add(IPAddress.Parse("10.0.0.1"));
        });

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            // ok: gimlet.security.forwarded-headers-trust-all-csharp
            o.KnownNetworks.Clear();
            o.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("10.0.0.0"), 8));
        });

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            // ok: gimlet.security.forwarded-headers-trust-all-csharp
            o.KnownProxies.Clear();
            o.KnownProxies.Add(IPAddress.Parse("10.0.0.2"));
        });

        services.AddSession(options =>
        {
            // ruleid: gimlet.security.cookie-secure-policy-csharp
            options.Cookie.SecurePolicy = CookieSecurePolicy.None;
        });
        services.AddAntiforgery(options =>
        {
            // ruleid: gimlet.security.cookie-secure-policy-csharp
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            // ruleid: gimlet.security.antiforgery-frame-header-off-csharp
            options.SuppressXFrameOptionsHeader = true;
        });
        services.ConfigureApplicationCookie(o =>
        {
            // ruleid: gimlet.security.cookie-secure-policy-csharp
            o.Cookie.SecurePolicy = CookieSecurePolicy.None;
        });

        services.AddSession(options =>
        {
            // ok: gimlet.security.cookie-secure-policy-csharp
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        });
        services.AddAntiforgery(options =>
        {
            // ok: gimlet.security.cookie-secure-policy-csharp
            options.Cookie.HttpOnly = true;
            // ok: gimlet.security.antiforgery-frame-header-off-csharp
            options.SuppressXFrameOptionsHeader = false;
        });
        services.ConfigureApplicationCookie(o =>
        {
            // ok: gimlet.security.cookie-secure-policy-csharp
            o.Cookie.SameSite = SameSiteMode.Strict;
        });

        var a = new AntiforgeryOptions();
        // ruleid: gimlet.security.antiforgery-frame-header-off-csharp
        a.SuppressXFrameOptionsHeader = true;
        var b = new AntiforgeryOptions();
        // ruleid: gimlet.security.antiforgery-frame-header-off-csharp
        b.SuppressXFrameOptionsHeader = true;
        // ok: gimlet.security.antiforgery-frame-header-off-csharp
        var suppress = b.SuppressXFrameOptionsHeader;
        // ok: gimlet.security.antiforgery-frame-header-off-csharp
        a.SuppressXFrameOptionsHeader = false;
    }
}
