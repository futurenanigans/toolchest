using Microsoft.AspNetCore.Http;

namespace Merkhet.Tests.Cookies;

public class SessionCookieExamples
{
    public void SetSessionInsecure(HttpResponse res, string token)
    {
        // ruleid: merk.security.cookie-httponly-disabled-csharp
        res.Cookies.Append("session", token, new CookieOptions
        {
            HttpOnly = false,
            Secure = true,
        });

        // ruleid: merk.security.cookie-secure-disabled-csharp
        res.Cookies.Append("auth", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = false,
        });

        // ruleid: merk.security.cookie-samesite-none-csharp
        res.Cookies.Append("sso", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.None,
        });

        // ok: merk.security.cookie-httponly-disabled-csharp
        res.Cookies.Append("safe", token, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
        });
    }
}
