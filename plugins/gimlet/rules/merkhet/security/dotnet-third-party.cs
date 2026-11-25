// Fixture for dotnet-third-party.yml
// Tests: restsharp-addheader-crlf-csharp, duende-secret-unhashed-csharp,
//        hangfire-dashboard-no-auth-csharp

using RestSharp;
using Duende.IdentityServer.Models;
using Hangfire;

// ─── RestSharp AddHeader / AddOrUpdateHeader ─────────────────────────────────

public class RestSharpExamples
{
    public void SendRequest(string userSuppliedHeader)
    {
        var request = new RestRequest("/api/data");

        // ruleid: merk.security.restsharp-addheader-crlf-csharp
        request.AddHeader("X-Custom", userSuppliedHeader);

        // ruleid: merk.security.restsharp-addheader-crlf-csharp
        request.AddOrUpdateHeader("X-Trace", userSuppliedHeader);

        string computed = "Bearer " + userSuppliedHeader;
        // ruleid: merk.security.restsharp-addheader-crlf-csharp
        request.AddHeader("Authorization", computed);

        // ok: merk.security.restsharp-addheader-crlf-csharp
        request.AddHeader("Accept", "application/json");

        // ok: merk.security.restsharp-addheader-crlf-csharp
        request.AddOrUpdateHeader("Content-Type", "application/json");
    }
}

// ─── Duende IdentityServer Secret hashing ────────────────────────────────────

public static class ClientConfig
{
    public static IEnumerable<Client> GetClients()
    {
        return new List<Client>
        {
            new Client
            {
                ClientId = "spa-client",
                ClientSecrets =
                {
                    // ruleid: merk.security.duende-secret-unhashed-csharp
                    new Secret("plaintext-secret-here"), // gitleaks:allow
                },
            },
            new Client
            {
                ClientId = "api-client",
                ClientSecrets =
                {
                    // ok: merk.security.duende-secret-unhashed-csharp
                    new Secret("correct-secret".Sha256()), // gitleaks:allow
                },
            },
            new Client
            {
                ClientId = "api-client-512",
                ClientSecrets =
                {
                    // ok: merk.security.duende-secret-unhashed-csharp
                    new Secret("correct-secret".Sha512()), // gitleaks:allow
                },
            },
        };
    }
}

// ─── Hangfire Dashboard authorization ────────────────────────────────────────

public static class HangfireSetup
{
    public static void Configure(WebApplication app)
    {
        // ruleid: merk.security.hangfire-dashboard-no-auth-csharp
        app.UseHangfireDashboard();

        // ruleid: merk.security.hangfire-dashboard-no-auth-csharp
        app.UseHangfireDashboard("/hangfire");

        // ruleid: merk.security.hangfire-dashboard-no-auth-csharp
        app.UseHangfireDashboard("/jobs", new DashboardOptions
        {
            AppPath = "/",
        });

        // ok: merk.security.hangfire-dashboard-no-auth-csharp
        var opts = new DashboardOptions
        {
            Authorization = new[] { new MyAuthFilter() },
        };
        app.UseHangfireDashboard("/hangfire", opts);

        // ok: merk.security.hangfire-dashboard-no-auth-csharp
        app.UseHangfireDashboard("/jobs", new DashboardOptions
        {
            Authorization = new[] { new MyAuthFilter() },
            AppPath = "/",
        });
    }
}

public class MyAuthFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context) => true;
}
