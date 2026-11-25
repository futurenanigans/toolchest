<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `repeated-allocation`

Awl reports supported materializations of changing inputs and copies of growing values inside iterations. Follow the call path to the copy. Identify what owns the source, what the next operation does, and who retains the result. Those three facts decide whether the allocation buys anything. Awl rule definition (`docs/performance-families.md`)

## Is this a false positive?

If each loop element supplies its own data, add up the lengths actually copied. Freezing three rule descriptors that require 2, 0 and 3 evidence IDs copies five ID references in total. There is still a snapshot per descriptor. A finding that multiplies the number of descriptors by the size of the *entire* evidence collection overstates that work. Repeatedly copying a shared, growing prefix really does recopy earlier elements. Awl’s cost model (`docs/performance-costs.md#source-summaries`)

## Keep a snapshot before mutating the collection

```csharp
var matches = handlers.OfType<JsonObject>()
    .Where(handler => Matches(handler, owned)).ToArray();
foreach (var handler in matches)
    handlers.Remove(handler);
```

The array fixes the set of matching handlers before the first removal. Iterating the live filtered `JsonArray` while removing from it could invalidate its enumerator. Awl uses the same reasoning one level out when it removes empty groups. A real allocation here preserves correct traversal. Hook removal in Awl (`src/Awl.Hook/Codex/CodexInstallation.cs`) · [Microsoft, Enumerable.ToArray](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.toarray?view=net-10.0)

## Drop an extra copy around an operation that already buffers

Awl’s cost comparison walks eligible degrees from largest to smallest, updating counts as it goes. In this immediate LINQ-to-Objects `foreach`, ordering reads the keys before the first loop body runs. The loop can use that ordered sequence directly. Awl’s cost comparison (`src/Awl.Rules/Performance/CostCoverageCounts.cs`) · [Microsoft, Intermediate materialization](https://learn.microsoft.com/en-us/dotnet/standard/linq/intermediate-materialization)

**Before**

```csharp
var eligible = counts.Keys.Where(degree => degree >= minimum);
foreach (int degree in eligible.ToArray().OrderDescending())
    Consume(degree);
```

**After**

```csharp
var eligible = counts.Keys.Where(degree => degree >= minimum);
foreach (int degree in eligible.OrderDescending())
    Consume(degree);
```

A trailing `.OrderDescending().ToArray()` is also unnecessary when this loop is the only consumer. An explicit snapshot still matters if the caller saves the result, enumerates it again, or permits changes between capturing it and starting the loop.

## Freeze an element’s own data at the ownership boundary

```csharp
foreach (var descriptor in descriptors)
{
    var ids = Array.AsReadOnly(descriptor.RequiredEvidence.ToArray());
    registered.Add(descriptor with { RequiredEvidence = ids });
}
```

Awl’s registry captures each descriptor’s required evidence IDs. Copying the backing collection and exposing a read-only view keeps a caller’s later mutations out of the registry. The IDs are strings, so copying their references suffices. Keep this once-per-owner copy when the registration promises a stable value. If the same descriptor is captured for every unrelated request, inspect that outer lifetime. Registry capture (`src/Awl.Engine/Rules.cs`) · Descriptor ownership (`src/Awl.Engine/RuleValidation.cs`) · [Microsoft, Array.AsReadOnly](https://learn.microsoft.com/en-us/dotnet/api/system.array.asreadonly?view=net-10.0)
