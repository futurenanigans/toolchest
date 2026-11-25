using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace Merkhet.Tests.Auth;

// ruleid: merk.security.auth-missing-authorize-csharp
public class UsersController : Controller
{
    public IActionResult Index() => View();
}

[Authorize]
public class AdminController : Controller
{
    // ok: merk.security.auth-missing-authorize-csharp
    public IActionResult Panel() => View();
}

[AllowAnonymous]
public class LoginController : Controller
{
    // ok: merk.security.auth-missing-authorize-csharp
    public IActionResult SignIn() => View();
}

public class JwtConfigExamples
{
    public TokenValidationParameters InsecureSignatureOff()
    {
        // ruleid: merk.security.auth-jwt-skip-signature-validation-csharp
        return new TokenValidationParameters
        {
            RequireSignedTokens = false,
        };
    }

    public TokenValidationParameters InsecureKeyOff()
    {
        // ruleid: merk.security.auth-jwt-skip-signature-validation-csharp
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = false,
        };
    }

    public TokenValidationParameters Safe()
    {
        // ok: merk.security.auth-jwt-skip-signature-validation-csharp
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
        // ruleid: merk.security.auth-jwt-skip-lifetime-validation-csharp
        return new TokenValidationParameters
        {
            ValidateLifetime = false,
        };
    }

    public TokenValidationParameters ExpiryOff()
    {
        // ruleid: merk.security.auth-jwt-skip-lifetime-validation-csharp
        return new TokenValidationParameters
        {
            RequireExpirationTime = false,
        };
    }

    public void DisableAtRuntime(TokenValidationParameters opts)
    {
        // ruleid: merk.security.auth-jwt-skip-lifetime-validation-csharp
        opts.ValidateLifetime = false;
    }
}
