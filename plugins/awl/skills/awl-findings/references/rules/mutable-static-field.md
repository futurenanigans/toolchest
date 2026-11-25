<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `mutable-static-field`

Awl distinguishes an assignable static field from a readonly static field whose declared type exposes mutation. The second finding describes a surface callers could mutate. Check whether the data is a permanent lookup, a cache, or state belonging to an individual request. Awl rule definition (`docs/reliability-state.md`)

Use a **read-only snapshot** for a fixed lookup. Build it completely before publication and choose immutable element values. For evolving state, give it an instance owner with the right lifetime. An application-wide cache also needs an explicit concurrency policy. [Microsoft, FrozenDictionary](https://learn.microsoft.com/en-us/dotnet/api/system.collections.frozen.frozendictionary-2?view=net-10.0)

**Before**

```csharp
static readonly Dictionary<string, int> Priorities =
    new(StringComparer.Ordinal) { ["normal"] = 1, ["urgent"] = 2 };
```

**After**

```csharp
static readonly FrozenDictionary<string, int> Priorities =
    new Dictionary<string, int>
    {
        ["normal"] = 1,
        ["urgent"] = 2
    }.ToFrozenDictionary(StringComparer.Ordinal);
```

This preserves ordinal case-sensitive lookup. Freezing a map leaves mutable objects stored *in* it mutable. When a library object has a mutable-looking API but is constructed once, kept private and safely shared, inspect its actual sharing contract before replacing it or allocating one per call.

## When mutable state belongs to one operation

Suppose each import should process a row ID once. With a `static readonly HashSet<string>`, an ID seen in yesterday’s import can suppress a valid row today. Give the set the lifetime of a single import.

```csharp
void Import(IEnumerable<Row> rows)
{
    var seen = new HashSet<string>(StringComparer.Ordinal);
    foreach (var row in rows)
        if (seen.Add(row.Id)) Save(row);
}
```

Overlapping imports now have independent sets. This example assumes each import visits its rows sequentially and duplicates across runs are valid. If uniqueness must hold across all imports, the shared storage that accepts the row needs to enforce that invariant.
