using Microsoft.IdentityModel.Tokens;
using Microsoft.Owin.Security.OpenIdConnect;
using Microsoft.Owin.Security.Cookies;
using Owin;

public class Startup
{
    public void Configuration(IAppBuilder app)
    {
        app.UseOpenIdConnectAuthentication(new OpenIdConnectAuthenticationOptions
        {
            ClientId = "x",
            Authority = "https://login.example.com",
            TokenValidationParameters = new TokenValidationParameters
            {
                // ruleid: gimlet.security.owin-oidc-validate-issuer-disabled-csharp
                ValidateIssuer = false,
                // ruleid: gimlet.security.owin-oidc-validate-audience-disabled-csharp
                ValidateAudience = false,
                // ruleid: gimlet.security.owin-oidc-validate-lifetime-disabled-csharp
                ValidateLifetime = false,
                // ruleid: gimlet.security.owin-oidc-validate-signing-disabled-csharp
                ValidateIssuerSigningKey = false,
            },
        });

        app.UseCookieAuthentication(new CookieAuthenticationOptions
        {
            // ruleid: gimlet.security.owin-cookie-insecure-csharp
            CookieSecure = CookieSecureOption.Never,
            // ruleid: gimlet.security.owin-cookie-http-only-off-csharp
            CookieHttpOnly = false,
        });

        // ok: gimlet.security.owin-oidc-validate-issuer-disabled-csharp, gimlet.security.owin-oidc-validate-audience-disabled-csharp, gimlet.security.owin-oidc-validate-lifetime-disabled-csharp, gimlet.security.owin-oidc-validate-signing-disabled-csharp
        app.UseOpenIdConnectAuthentication(new OpenIdConnectAuthenticationOptions
        {
            ClientId = "x",
            Authority = "https://login.example.com",
            TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
            },
        });

        // ok: gimlet.security.owin-cookie-insecure-csharp, gimlet.security.owin-cookie-http-only-off-csharp
        app.UseCookieAuthentication(new CookieAuthenticationOptions
        {
            CookieSecure = CookieSecureOption.Always,
            CookieHttpOnly = true,
        });
    }
}
