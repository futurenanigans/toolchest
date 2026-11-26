# Fixing gimlet findings

One section per kind of defect. Each starts with the rule ids that lead to it across every scanner, so a finding from opengrep, the SDK analyzers or Dotnetarium on the same defect lands on the same fix. Search this file for the rule id. Opengrep ids appear without their `gimlet.security.` or `csharp_*_rule-` prefix. The audit rule `aspnet-controller-entrypoint` is an inventory of entrypoints, not a defect, and has no fix.

Before editing, confirm the finding is real (see Triage in SKILL.md). After editing, re-run the narrowest scan that covers the line (`gimlet scan <file> --only <scanner>`) and report that the finding is gone. A change that only stops the scanner matching (renaming, casting, moving the value through a helper the rule does not follow) is not a fix; neither is a suppression.

When the right fix needs a decision the code cannot make (which origins CORS allows, which hosts a fetch may reach, whether an endpoint is public), make the safe default change, name the decision, and leave it to the user.

## SQL injection

`DNA0001`, `CA2100`, `CA3001`, `sql-injection-csharp`, `dapper-sql-injection-csharp`, `SQLInjection`.

Pass values as parameters; never build SQL text from them.

```csharp
// ADO.NET
using var cmd = new SqlCommand("SELECT * FROM Users WHERE Name = @name", conn);
cmd.Parameters.Add("@name", SqlDbType.NVarChar, 256).Value = name;

// Dapper
conn.Query<User>("SELECT * FROM Users WHERE Name = @name", new { name });

// EF Core: FromSql and ExecuteSql turn interpolation holes into parameters; the *Raw variants do not.
db.Users.FromSql($"SELECT * FROM Users WHERE Name = {name}");
db.Database.ExecuteSql($"DELETE FROM Sessions WHERE UserId = {id}");
```

`FromSqlRaw` and `ExecuteSqlRaw` are safe only with a constant string and `{0}` placeholders filled from the argument list. A query built entirely in LINQ needs no SQL at all, which is the better fix when the raw SQL does nothing LINQ cannot.

CA2100 also fires on non-constant SQL that carries no input (a query assembled from constants in branches). That is a false positive when every fragment is a literal; say so instead of rewriting it.

## SQL identifiers and dynamic ordering

`dapper-identifier-injection-csharp`, `ef-ormleak-dynamic-orderby`, `ef-ormleak-taint-dynamic-include`, `ef-ormleak-taint-property`.

Column names, sort directions and `Include` paths cannot be parameters. Map the input to a fixed set.

```csharp
var column = sort switch
{
    "name" => "Name",
    "created" => "CreatedAt",
    _ => throw new BadHttpRequestException("unknown sort"),
};
```

For EF, switch on the input and call `OrderBy(u => u.Name)` per case. Never pass the input to `EF.Property`, a dynamic LINQ string, or `Include(string)`.

## OS command injection

`DNA0002`, `CA3006`, `command-injection-csharp`, `CommandInjection`, `command-injection-processstartinfo-useshell`.

Keep the executable fixed, keep `UseShellExecute = false`, and pass each argument through `ArgumentList`, which quotes per argument and never goes through a shell.

```csharp
var psi = new ProcessStartInfo("/usr/bin/convert") { UseShellExecute = false };
psi.ArgumentList.Add("--");
psi.ArgumentList.Add(inputPath);
psi.ArgumentList.Add(outputPath);
Process.Start(psi);
```

`ArgumentList` stops argument splitting; it does not stop an argument the target program reads as an option. Put `--` before user values when the program supports it, or reject values starting with `-`. If the executable name comes from input, map it from an allowlist.

## Path traversal and file uploads

`DNA0004`, `CA3003`, `path-traversal-csharp`, `PathTraversal`, `upload-filename-path-csharp`, `CA5389`.

Resolve the full path and check it stays under the base directory.

```csharp
var baseDir = Path.GetFullPath(_options.DataRoot) + Path.DirectorySeparatorChar;
var full = Path.GetFullPath(Path.Combine(baseDir, requested));
if (!full.StartsWith(baseDir, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
    return Results.BadRequest();
```

For uploads, never use `IFormFile.FileName` as a path. Store under a generated name (`Path.GetRandomFileName()` or a GUID) and keep the original name only as data. For archive extraction (CA5389), apply the same check to each entry's destination path before writing it.

## Open redirect

`DNA0005`, `CA3007`, `open-redirect-csharp`, `UnvalidatedRedirect`.

Redirect only to local URLs: `LocalRedirect(returnUrl)` in MVC, `Results.LocalRedirect(returnUrl)` in minimal APIs, or check `Url.IsLocalUrl(returnUrl)` first and fall back to a fixed page. When external targets are legitimate, map an id from the request to a configured URL.

## Cross-site scripting

`DNA0003`, `CA3002`, `xss-*`, `razor-html-raw`, `htmlstring-tainted-csharp`, `blazor-markupstring-tainted-csharp`, `HtmlElementXss`, `ScriptXss`, `allow-html-attribute-csharp`, `validate-input-false-csharp`, `request-unvalidated-csharp`, `InputValidation`, `webconfig-request-validation-legacy`.

Razor and Blazor encode by default; the fix is almost always to stop opting out. Replace `@Html.Raw(x)`, `new HtmlString(x)` and `(MarkupString)x` with plain `@x`. When the value must carry HTML (rich text), sanitize it with an allowlist HTML sanitizer before storing or rendering; adding that package is a dependency decision for the user. For values written into JavaScript, serialize with `JsonSerializer.Serialize` and render through a `data-` attribute instead of building script text. `ViewBag` values are encoded like any other `@` expression, so a ViewBag finding is real only when it ends in one of the raw forms above.

On .NET Framework, `[ValidateInput(false)]`, `[AllowHtml]`, `Request.Unvalidated` and `<httpRuntime requestValidationMode="2.0">` turn off request validation; remove them and encode on output, or limit them to the one field that needs HTML and sanitize that field.

## LDAP injection

`DNA0006`, `CA3005`, `LdapInjection`.

Escape every value placed in a filter per RFC 4515. .NET has no built-in escaper, so add one beside the query:

```csharp
static string EscapeLdapFilter(string value)
{
    var sb = new StringBuilder(value.Length);
    foreach (var c in value)
        sb.Append(c switch
        {
            '\\' => @"\5c", '*' => @"\2a", '(' => @"\28", ')' => @"\29", '\0' => @"\00",
            _ => c.ToString(),
        });
    return sb.ToString();
}
```

Where the value has a known shape (an account name), validating it against that shape is simpler and stronger.

## XPath injection

`DNA0007`, `CA3008`, `XPathInjection`.

Replace string-built XPath with LINQ to XML, which compares values without parsing them:

```csharp
var user = doc.Descendants("user").FirstOrDefault(e => (string?)e.Element("name") == name);
```

When XPath must stay, validate the value against a strict pattern before it reaches the expression.

## Server-side request forgery

`DNA0011`, `ssrf-csharp`.

Do not fetch a URL taken from a request. Prefer an id the server maps to a configured URL. When arbitrary hosts are a feature (webhooks, link previews), require `https`, check the host against an allowlist, and reject private, loopback and link-local addresses at connect time through `SocketsHttpHandler.ConnectCallback`, because a name can resolve differently between check and use. Which hosts are allowed is a decision for the user.

## Code injection and unsafe reflection

`DNA0012`, `script-code-injection-csharp`, `unsafe-reflection-csharp`, `xmlserializer-type-injection-csharp`, `CA3011`.

Never compile, evaluate or load a type or assembly named by input. Map the input to a fixed set of types or delegates:

```csharp
IExporter exporter = format switch { "csv" => new CsvExporter(), "json" => new JsonExporter(), _ => throw new BadHttpRequestException("format") };
```

## Insecure deserialization

`DNA0008`, `DNA0023`, `CA2300` to `CA2330`, `CA2350` to `CA2362`, `insecure-deserialization-*`, `datacontract-knowntype*`, `InsecureDeserialization`.

Replace `BinaryFormatter`, `NetDataContractSerializer`, `LosFormatter`, `ObjectStateFormatter` and `JavaScriptSerializer` with `System.Text.Json` deserializing into a concrete DTO. For Json.NET, set `TypeNameHandling = TypeNameHandling.None`; when polymorphism is required, keep `TypeNameHandling.Auto` only with an `ISerializationBinder` that allows a fixed list of types, or move to `System.Text.Json` with `[JsonDerivedType]` attributes. `DataContractSerializer` known types must be a fixed list in code, never built from input. `DataSet.ReadXml` on untrusted data (CA2350/CA2351) has no safe configuration; parse the XML into DTOs.

## XML external entities and XSLT

`DNA0021`, `CA3075`, `CA3077`, `xxe-*`, `XmlDocumentXXEInjection`, `XmlReaderXXEInjection`, `CA3076`, `UnsafeXSLTSettingUsed`.

```csharp
var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
using var reader = XmlReader.Create(stream, settings);
var doc = new XmlDocument { XmlResolver = null };
doc.Load(reader);
```

Load `XmlDocument` through such a reader instead of `Load(path)` or `LoadXml(text)`. For XSLT, use `XsltSettings.Default` (no script, no `document()`) and pass `null` as the resolver to `XslCompiledTransform.Load`.

## Weak hashing, ciphers and randomness

`CA5350`, `CA5351`, `CA5358`, `CA5394`, `DNA0013`, `DNA0014`, `DNA0015`, `weak-hash-csharp`, `weak-cipher-csharp`, `ecb-mode-csharp`, `crypto-static-iv-csharp`, `WeakCipherMode`, `insecure-randomness-csharp`.

| Found | Replace with |
|---|---|
| MD5, SHA1 for integrity or identifiers | `SHA256.HashData` |
| MD5, SHA1 as a keyed MAC | `HMACSHA256.HashData(key, data)` |
| MD5, SHA1, SHA256 for passwords | see Password storage below |
| DES, TripleDES, RC2, AES-ECB, AES-CBC without a MAC | `AesGcm` with a fresh 12-byte nonce per message |
| A constant or reused IV or nonce | `RandomNumberGenerator.Fill(nonce)` for every encryption, stored beside the ciphertext |
| `System.Random` for tokens, codes, salts | `RandomNumberGenerator.GetInt32`, `RandomNumberGenerator.GetBytes` |

A weak hash that interoperates with an external format (a protocol field, a legacy file checksum) is a false positive when nothing security-relevant depends on it; say what the format is. Changing a stored hash or cipher format needs a migration path for existing data, which is the user's decision.

## Password storage and key derivation

`CA5373`, `CA5379`, `CA5387`, `CA5388`, `DNA0016`, `pbkdf2-default-iterations-csharp`, `pbkdf2-low-iterations-csharp`.

Prefer ASP.NET Core Identity's `PasswordHasher<TUser>`, which versions its format and rehashes on login. When deriving keys directly, use `Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, 32)` with a random 16-byte salt and at least 600,000 iterations for SHA-256 (the OWASP Password Storage Cheat Sheet figure). Store the iteration count with the hash so it can be raised later.

## Hard-coded secrets and keys

`DNA0009`, `DNA0017`, `DNA0022`, `CA5390`, every `secrets` finding, `crypto-key-literal-csharp`, `jwt-symmetric-key-literal-csharp`, `hardcoded-credential-assignment-csharp`, `connection-string-with-password`, `appsettings-*` (except `appsettings-http-endpoint`), `identitymodel-client-secret-literal-csharp`, `duende-secret-unhashed-csharp`.

Move the value out of the repository and read it through configuration: `dotnet user-secrets` in development, environment variables or a secret store (Azure Key Vault, AWS Secrets Manager) in deployment, bound with `IOptions<T>`. Leave the key in `appsettings.json` with an empty value only when the app needs it to exist. A secret that was ever committed is compromised: say it must be rotated at its provider, because the old value stays in every clone and in history. Rewriting history is a destructive step for the user to take, never part of the fix. For Duende/IdentityServer client secrets, store `"secret".Sha256()` instead of the plain value.

## TLS and certificate validation

`DNA0020`, `CA5359`, `CA5364`, `CA5378`, `CA5386`, `tls-*`, `identitymodel-cert-validation-bypass-csharp`, `cleartext-*`, `appsettings-http-endpoint`, `identitymodel-discovery-http-csharp`, `DNA0019`.

Delete callbacks that return `true` and `DangerousAcceptAnyServerCertificateValidator`. For a development self-signed certificate, trust it on the machine (`dotnet dev-certs https --trust`) instead of in code. For a private CA, validate the chain against that CA in the callback, or compare the certificate's thumbprint to a configured value. Leave `SslProtocols` and `SecurityProtocolType` unset so the OS chooses. Use `https` for every outbound URL and metadata endpoint, and keep `RequireHttpsMetadata = true`.

## Cookies

`DNA0010`, `CA5382`, `CA5383`, `cookie-*`, `CookieWithoutHttpOnlyFlag`, `CookieWithoutSSLFlag`, `owin-cookie-*`, `forms-auth-*`, `webconfig-cookies-not-ssl`.

```csharp
Response.Cookies.Append("pref", value, new CookieOptions { Secure = true, HttpOnly = true, SameSite = SameSiteMode.Lax });
builder.Services.ConfigureApplicationCookie(o => o.Cookie.SecurePolicy = CookieSecurePolicy.Always);
```

`SameSite = None` is correct only for a cookie that must travel on cross-site requests, and then needs `Secure = true`. On .NET Framework set `<httpCookies requireSSL="true" httpOnlyCookies="true" />` and `requireSSL="true"` on `<forms>`, and remove `cookieless` settings.

## CORS

`DNA0024`, `cors-wildcard-aspnet-csharp`, `cors-wildcard-origin-aspnet-csharp`.

Name the origins: `policy.WithOrigins(config.GetSection("Cors:Origins").Get<string[]>()!)`. Never combine credentials with `AllowAnyOrigin` or `SetIsOriginAllowed(_ => true)`. `AllowAnyOrigin` alone is acceptable for a public, unauthenticated, read-only API; say that when it applies. The origin list is the user's decision.

## CSRF

`CA3147`, `CA5391`, `csrf-missing-antiforgery-csharp`, `Csrf`, `antiforgery-frame-header-off-csharp`.

For cookie-authenticated MVC apps, add `options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute())` once instead of per action. For minimal-API form endpoints on .NET 8+, call `app.UseAntiforgery()`, which validates form posts by default. An API authenticated only by bearer tokens in a header is not exposed to CSRF; that finding is a false positive and the reason is the auth scheme. Leave `SuppressXFrameOptionsHeader` false.

## Authentication and authorization

`auth-missing-authorize-csharp`, `allow-anonymous-state-change-csharp`, `aspnet-authz-*`, `auth-jwt-*`, `CA5404`, `owin-oidc-validate-*`, `identitymodel-discovery-issuer-off-csharp`, `hangfire-dashboard-no-auth-csharp`, `swagger-in-prod-csharp`.

Make authentication the default and opt out explicitly:

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
```

Remove `[AllowAnonymous]` from state-changing actions unless the action is meant to be public (login, sign-up), which is the user's call. An `AuthorizationHandler` must call `context.Succeed` only after checking the requirement, and never in a `catch`. Keep every `TokenValidationParameters` validation on (`ValidateIssuer`, `ValidateAudience`, `ValidateLifetime`, `ValidateIssuerSigningKey`, `RequireSignedTokens`, `RequireExpirationTime`). Map Swagger UI, `MapOpenApi()` and the Hangfire dashboard only inside `if (app.Environment.IsDevelopment())`, or put them behind an authorization policy.

## Identity policy

`identity-lockout-*`, `identity-weak-password-policy-csharp`, `PasswordComplexity`.

Pass `lockoutOnFailure: true` to `PasswordSignInAsync`, keep `Lockout.AllowedForNewUsers = true` and `MaxFailedAccessAttempts` at 5 or fewer, and keep `Password.RequiredLength` at 8 or more (NIST SP 800-63B's minimum). Length matters more than character-class rules.

## Errors and diagnostics exposure

`developer-exception-page-in-prod-csharp`, `stacktrace-*`, `exception-detail-in-problem-csharp`, `fail-open-catch-csharp`, `webconfig-custom-errors-off`, `webconfig-debug-compilation`, `webconfig-trace-enabled`, `glimpse-diagnostics-present`, `CA3004`, `DNA0018`.

Use `UseDeveloperExceptionPage` only in Development (`WebApplication` already does this by default, so an explicit call outside that check is the finding). In production use `app.UseExceptionHandler()` with `AddProblemDetails()` and log the exception; never copy `ex.Message` or `ex.ToString()` into a response. For gRPC, set `EnableDetailedErrors = true` only in Development. A `catch` that returns success or grants access fails open; let it propagate, or return a denial. On .NET Framework set `<compilation debug="false">`, `<customErrors mode="RemoteOnly">` and `<trace enabled="false">`, and remove Glimpse from production builds.

## Logging

`log-injection-csharp`, `log-template-not-constant-csharp`, `logging-sensitive-field-csharp`.

Use a constant message template with named holes: `logger.LogInformation("Login failed for {User}", user)`. Structured sinks keep the value as a field; for plain-text sinks, strip CR and LF from the value. Never log passwords, tokens, connection strings or full request bodies; log an id instead.

## Mass assignment

`mass-assignment-*`.

Bind requests to DTOs that hold only the fields a caller may set, then copy them onto the loaded entity. Never pass a bound entity to `DbContext.Update` or `Attach`, and on MVC 5 never call `UpdateModel` without an include list.

## Regular expressions

`regex-no-timeout-csharp`, `CA3012`.

Give every regex that sees input a timeout (`new Regex(pattern, options, TimeSpan.FromMilliseconds(250))`) or use `RegexOptions.NonBacktracking` on .NET 7+, which runs in linear time. A pattern built from input must go through `Regex.Escape`.

## Reverse proxies

`forwarded-headers-trust-all-csharp`.

List the proxies: `options.KnownProxies.Add(IPAddress.Parse(...))` or `KnownNetworks`, read from configuration. Clearing both lists trusts `X-Forwarded-For` from any client, which lets callers spoof their IP and scheme.

## Packages and package sources

Every `packages` and `osv` finding, `floating-package-version`, `nuget-http-source`, `moq-sponsor-link`, `rhino-mocks-in-production`, `restsharp-addheader-crlf-csharp`.

Upgrade to the first patched version the advisory names. A direct reference changes in its `PackageReference` or, with Central Package Management, in `Directory.Packages.props`. A vulnerable transitive package is fixed by upgrading the direct package that brings it in, when a release with the fix exists; otherwise pin it: with Central Package Management, set `<CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled>` and add a `PackageVersion`; without it, add a direct `PackageReference` at the patched version. Build and run the tests after a major-version jump. Replace floating versions (`*`, `1.*`) with exact ones, and `http://` package sources with `https://`. Packages the rules flag as abandoned or as shipping unwanted components (Rhino Mocks, the Moq versions named in the rule message) are replaced or moved to a version outside the flagged range; which replacement is the user's choice. Then re-run `gimlet scan --only packages,osv`.

## OpenAPI document findings (Spectral)

`owasp:api*` rules.

Fix the API, then let the generated document reflect it; do not hand-edit generated output.

| Rule | Fix in code |
|---|---|
| `api2:*-read-restricted`, `*-write-restricted`, `api2:*-auth-*` | Require authorization on the endpoint and describe the scheme with a document transformer in `AddOpenApi(o => o.AddDocumentTransformer(...))` |
| `api4:*-string-limit`, `*-string-restricted`, `*-array-limit`, `*-integer-limit` | `[MaxLength]`, `[StringLength]`, `[Range]`, `[RegularExpression]` on DTO properties and parameters, which the OpenAPI generator emits as schema limits, plus validation that enforces them |
| `api4:*-rate-limit*` | `AddRateLimiter` with `RequireRateLimiting(...)`, and `.Produces(StatusCodes.Status429TooManyRequests)` |
| `api8:*-define-error-*` | `.ProducesProblem(400)`, `.Produces(401)`, `.ProducesProblem(500)` on the endpoint or group |
| `api9:*-inventory-*` | Set `servers` and their `x-internal` flag in a document transformer |

A rule about something a gateway enforces in front of the app (rate limiting, auth) is needs-context; say where the control lives.

## Runtime findings (Schemathesis and ZAP)

Schemathesis `ST101` (server error): the log holds a reproducing request. Replay it, read the handler, and make it validate the input and return 400 with ProblemDetails; a 500 on bad input often hides an unguarded sink, so check what the input reached. `ST103` (undocumented status code): document the codes the endpoint really returns with `.Produces`, or stop returning the undocumented one. Other contract failures mean the response or input handling disagrees with the schema; fix whichever side is wrong.

ZAP alerts are classed by `pluginid`. Injection, path traversal and XSS alerts map to the sections above for the endpoint ZAP names. Missing-header alerts (`10021` X-Content-Type-Options, `10020` anti-clickjacking, `10038` CSP, `10035` HSTS) are fixed with one middleware that sets the headers, plus `app.UseHsts()` outside Development. `90022` Application Error Disclosure is the Errors section.

After fixing, re-run the probe that reported it (`gimlet probe --url ... --only schemathesis` or `--only zap`).
