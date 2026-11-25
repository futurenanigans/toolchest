# Rule roadmap

Every rule planned against the OWASP Top 10:2025 is either in `rules/gimlet/security` with a passing fixture or listed here as dropped.

Dropped because an existing rule already matches the same code:

| Planned rule | Covered by |
|---|---|
| `gimlet.security.jwt-unsigned-tokens-allowed-csharp` | `gimlet.security.auth-jwt-skip-signature-validation-csharp`, which matches `RequireSignedTokens = false` and `ValidateIssuerSigningKey = false` in initializers and assignments |
| `gimlet.security.dangerous-accept-any-certificate-csharp` | `gimlet.security.tls-httpclienthandler-always-trust-csharp`, which matches `HttpClientHandler.DangerousAcceptAnyServerCertificateValidator` |

Out of reach for pattern matching, and not planned: IDOR and other object-level authorization (A01, CWE-639), insecure design and business logic (A06), session fixation (A07, CWE-384), and known-vulnerable dependencies (A03, CWE-1104), which needs an advisory database and belongs to `dotnet list package --vulnerable`.
