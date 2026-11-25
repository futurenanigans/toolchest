<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `discouraged-member`

Awl selects an exact configured member in an identified assembly. The selector list is empty by default. Inspect the configured declaration, the use site and the reason that particular dependency is discouraged. Awl rule definition (`docs/reliability-configured-members.md`)

**Inject the capability** when the problem is hidden environment access. For a policy discouraging `DateTimeOffset.UtcNow` in expiry calculations, supply .NET’s `TimeProvider` at composition and take one reading per decision. [Microsoft, TimeProvider](https://learn.microsoft.com/en-us/dotnet/api/system.timeprovider?view=net-10.0) · [Seemann, Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)

**Before**

```csharp
static bool IsExpired(Token token) =>
    token.ExpiresAt <= DateTimeOffset.UtcNow;
```

**After**

```csharp
sealed class ExpiryPolicy(TimeProvider time)
{
    public bool IsExpired(Token token) =>
        token.ExpiresAt <= time.GetUtcNow();
}

var expiry = new ExpiryPolicy(TimeProvider.System);
```

Tests can now supply a clock fixed at the expiry instant. For a genuinely obsolete or prohibited API, replace the underlying call with the supported equivalent. A wrapper still contains the original bound use, and can itself be the finding.

## When policy selects an ambiguous overload

Suppose a project discourages `string.EndsWith(string)` for protocol markers because it uses the current culture. A case-sensitive, machine-defined suffix has a precise comparison rule, so the caller can state it directly.

```csharp
// Before the repair this called entry.EndsWith(".manifest").
bool IsManifest(string entry) => entry.EndsWith(".manifest", StringComparison.Ordinal);
```

The policy in this example selects the one-argument declaration. Use `OrdinalIgnoreCase` instead only if the protocol allows case variation. Injecting a service would add a dependency to a decision fully specified by the protocol. [Microsoft, String comparison best practices](https://learn.microsoft.com/en-us/dotnet/standard/base-types/best-practices-strings)
