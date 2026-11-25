using System;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

public class JwtKeys
{
    public SecurityKey Utf8Literal()
    {
        // ruleid: gimlet.security.jwt-symmetric-key-literal-csharp
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes("super-secret-signing-key-1234567890"));
    }

    public SecurityKey AsciiLiteral()
    {
        // ruleid: gimlet.security.jwt-symmetric-key-literal-csharp
        var key = new SymmetricSecurityKey(Encoding.ASCII.GetBytes("ThisIsMySecretKeyForJwt!!"));
        return key;
    }

    public TokenValidationParameters InParams()
    {
        return new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            // ruleid: gimlet.security.jwt-symmetric-key-literal-csharp
            IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String("c2VjcmV0LWtleS1mb3Itand0LXNpZ25pbmc=")),
        };
    }

    public SecurityKey FromConfig(IConfiguration config)
    {
        // ok: gimlet.security.jwt-symmetric-key-literal-csharp
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]));
    }

    public SecurityKey FromVaultSecret(string secretValue)
    {
        // ok: gimlet.security.jwt-symmetric-key-literal-csharp
        return new SymmetricSecurityKey(Convert.FromBase64String(secretValue));
    }

    public SecurityKey FromCertificate(X509Certificate2 cert)
    {
        // ok: gimlet.security.jwt-symmetric-key-literal-csharp
        return new X509SecurityKey(cert);
    }
}
