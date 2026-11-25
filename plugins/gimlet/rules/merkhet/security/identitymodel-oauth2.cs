using System.Net.Http;
using IdentityModel.Client;

public class TokenIssuer
{
    public void Configure()
    {
        var cache = new DiscoveryCache("https://login.example.com/.well-known/openid-configuration")
        {
            // ruleid: merk.security.identitymodel-discovery-http-csharp
            Policy = new DiscoveryPolicy { RequireHttps = false },
        };

        var cache2 = new DiscoveryCache("https://login.example.com/.well-known/openid-configuration")
        {
            // ruleid: merk.security.identitymodel-discovery-issuer-off-csharp
            Policy = new DiscoveryPolicy { ValidateIssuerName = false },
        };

        var req = new ClientCredentialsTokenRequest
        {
            Address = "https://login.example.com/connect/token",
            ClientId = "svc",
            // ruleid: merk.security.identitymodel-client-secret-literal-csharp
            ClientSecret = "secret-in-source",
        };

        var req2 = new ClientCredentialsTokenRequest
        {
            ClientId = "svc",
            // ok: merk.security.identitymodel-client-secret-literal-csharp
            ClientSecret = "",
        };

        var handler = new HttpClientHandler
        {
            // ruleid: merk.security.identitymodel-cert-validation-bypass-csharp
            ServerCertificateCustomValidationCallback = (_, _, _, _) => true,
        };
    }
}
