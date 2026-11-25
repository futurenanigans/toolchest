<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `literal-guard`

Awl groups a typed, unnamed value across distinct owning members in an assembly. A default supplied by the compiler and repeated mentions in a single member have different treatment from separate authored uses. Check the locations for shared meaning. Awl rule definition (`docs/literal-policy.md`)

**Replace Magic Literal** with a name owned by the shared contract. For a wire limit, the sender and reader must agree on the unit, inclusive boundary and value. If different environments intentionally choose different values, a validated setting can own that policy instead. [Fowler, Replace Magic Literal](https://refactoring.com/catalog/replaceMagicLiteral.html)

**Before**

```csharp
bool CanSend(string frame) => frame.Length <= 16 * 1024 * 1024;
bool RejectReceived(string frame) => frame.Length > 16 * 1024 * 1024;
```

**After**

```csharp
public static class FrameLimit
{
    public const int MaxCharacters = 16 * 1024 * 1024;
}

bool CanSend(string frame) => frame.Length <= FrameLimit.MaxCharacters;
bool RejectReceived(string frame) => frame.Length > FrameLimit.MaxCharacters;
```

Awl uses this pattern for the CLI and worker request limit. Two tests that happen to expect seven items often describe unrelated behaviors. Naming both `Seven` couples their edits without explaining either expectation. Awl’s shared limit (`src/Awl.Contracts/WorkerRequestLimit.cs`)

## When the repeated value is a deployment choice

Two background jobs pause for 30 seconds after an idle poll. Suppose operators can set their shared polling interval to any whole number from one second to one hour. Validate it where configuration enters and pass the same value to both jobs. [Microsoft, Options pattern](https://learn.microsoft.com/en-us/dotnet/core/extensions/options)

```csharp
if (settings.IdlePollSeconds is < 1 or > 3600)
    throw new ArgumentOutOfRangeException(nameof(settings.IdlePollSeconds));

var idleDelay = TimeSpan.FromSeconds(settings.IdlePollSeconds);
var incoming = new IncomingJobs(queue, idleDelay);
var outgoing = new OutgoingJobs(queue, idleDelay);

// In either worker's idle path
await Task.Delay(idleDelay, cancellationToken);
```

Use the existing configuration owner, with 30 seconds as its default, when this value genuinely varies by deployment. A wire limit that all peers must agree on has different ownership.

## When two equal literals have unrelated meanings

A search page size and a maximum tag length may both be 50 today. A product change allowing 80-character tags should leave paging alone. If both limits need names, put each name next to the decision it controls.

```csharp
static class SearchDefaults { public const int PageSize = 50; }
static class TagLimits { public const int MaxCharacters = 50; }
```

A search caller can now use `SearchDefaults.PageSize` and validation can use `TagLimits.MaxCharacters`. Their initial equality creates no requirement to change them together.
