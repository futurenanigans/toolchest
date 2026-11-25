using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace Gimlet.Tests.Auth;

// ruleid: gimlet.security.auth-missing-authorize-csharp
public class UsersController : Controller
{
    public IActionResult Index() => View();
}

[Authorize]
public class AdminController : Controller
{
    // ok: gimlet.security.auth-missing-authorize-csharp
    public IActionResult Panel() => View();
}

[AllowAnonymous]
public class LoginController : Controller
{
    // ok: gimlet.security.auth-missing-authorize-csharp
    public IActionResult SignIn() => View();
}

public class JwtConfigExamples
{
    public TokenValidationParameters InsecureSignatureOff()
    {
        // ruleid: gimlet.security.auth-jwt-skip-signature-validation-csharp
        return new TokenValidationParameters
        {
            RequireSignedTokens = false,
        };
    }

    public TokenValidationParameters InsecureKeyOff()
    {
        // ruleid: gimlet.security.auth-jwt-skip-signature-validation-csharp
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = false,
        };
    }

    public void ConfigureByAssignment(TokenValidationParameters tvp)
    {
        // ruleid: gimlet.security.auth-jwt-skip-signature-validation-csharp
        tvp.RequireSignedTokens = false;
        // ruleid: gimlet.security.auth-jwt-skip-signature-validation-csharp
        tvp.ValidateIssuerSigningKey = false;
        // ok: gimlet.security.auth-jwt-skip-signature-validation-csharp
        tvp.RequireSignedTokens = true;
    }

    public TokenValidationParameters Safe()
    {
        // ok: gimlet.security.auth-jwt-skip-signature-validation-csharp
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
        };
    }

    public TokenValidationParameters LifetimeOff()
    {
        // ruleid: gimlet.security.auth-jwt-skip-lifetime-validation-csharp
        return new TokenValidationParameters
        {
            ValidateLifetime = false,
        };
    }

    public TokenValidationParameters ExpiryOff()
    {
        // ruleid: gimlet.security.auth-jwt-skip-lifetime-validation-csharp
        return new TokenValidationParameters
        {
            RequireExpirationTime = false,
        };
    }

    public void DisableAtRuntime(TokenValidationParameters opts)
    {
        // ruleid: gimlet.security.auth-jwt-skip-lifetime-validation-csharp
        opts.ValidateLifetime = false;
    }
}
