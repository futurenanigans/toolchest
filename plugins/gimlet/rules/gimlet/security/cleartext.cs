using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

public static class AuthSetup
{
    public static void Configure(IServiceCollection services, IHostEnvironment env)
    {
        services.AddAuthentication().AddJwtBearer(options =>
        {
            options.Authority = "https://login.example.com";
            // ruleid: gimlet.security.cleartext-metadata-csharp
            options.RequireHttpsMetadata = false;
        });

        services.AddAuthentication().AddOpenIdConnect(o =>
        {
            o.Authority = "https://login.example.com";
            // ruleid: gimlet.security.cleartext-metadata-csharp
            o.RequireHttpsMetadata = false;
        });

        services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, jwt =>
        {
            // ruleid: gimlet.security.cleartext-metadata-csharp
            jwt.RequireHttpsMetadata = false;
        });

        services.AddAuthentication().AddJwtBearer(options =>
        {
            if (env.IsDevelopment())
            {
                // ok: gimlet.security.cleartext-metadata-csharp
                options.RequireHttpsMetadata = false;
            }
        });

        services.AddAuthentication().AddJwtBearer(options =>
        {
            // ok: gimlet.security.cleartext-metadata-csharp
            options.RequireHttpsMetadata = true;
        });

        services.AddAuthentication().AddOpenIdConnect(o =>
        {
            // ok: gimlet.security.cleartext-metadata-csharp
            o.RequireHttpsMetadata = !env.IsDevelopment();
        });
    }
}

public class PartnerClient
{
    private readonly HttpClient _http;

    public PartnerClient(HttpClient http)
    {
        _http = http;
        // ruleid: gimlet.security.cleartext-http-endpoint-csharp
        _http.BaseAddress = new Uri("http://api.partner.example.com/");
    }

    public async Task<string> FetchAsync()
    {
        // ruleid: gimlet.security.cleartext-http-endpoint-csharp
        var response = await _http.GetAsync("http://billing.example.com/invoices");
        return await response.Content.ReadAsStringAsync();
    }

    public async Task SendAsync(HttpContent body)
    {
        // ruleid: gimlet.security.cleartext-http-endpoint-csharp
        await _http.PostAsync("http://10.0.4.12:8080/events", body);
    }

    public async Task LocalAsync()
    {
        // ok: gimlet.security.cleartext-http-endpoint-csharp
        await _http.GetAsync("http://localhost:5000/health");
        // ok: gimlet.security.cleartext-http-endpoint-csharp
        await _http.GetAsync("http://127.0.0.1:9090/metrics");
        // ok: gimlet.security.cleartext-http-endpoint-csharp
        await _http.GetAsync("https://billing.example.com/invoices");
    }

    public Uri Binding()
    {
        // ok: gimlet.security.cleartext-http-endpoint-csharp
        return new Uri("http://*:8080");
    }

    public string Namespace()
    {
        // ok: gimlet.security.cleartext-http-endpoint-csharp
        const string ns = "http://schemas.xmlsoap.org/soap/envelope/";
        return ns;
    }
}
