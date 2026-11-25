<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `introduced-expensive-work`

Awl compares source-cost summaries for the selected base and target. A new work term or an increase in degree can trigger a finding. Read the matched function, work kind, base degrees and target call path. Moving work into a helper can leave the same cost in the caller. Awl rule definition (`docs/performance-families.md`)

## Is this a false positive?

Compare the primitive operation and the data it traverses in both revisions. A helper that reads each caller’s own bucket can be equivalent to the inlined loop. Check for repeated keys, independent rescans and hard source bounds before accepting a larger growth degree. A second full scan really is additional work even if both scans are linear. Revision comparison criteria (`docs/performance-families.md#revision-findings`) · [Checking the size factors](multiplicative-work.md#is-this-a-false-positive)

## Index data reused by a new feature

**Precompute an index at the natural batch boundary** when a new feature introduces repeated scans of stable data. This example adds tags to an existing exporter. The index belongs to this export and can preserve duplicate tags and their order. [Microsoft, Enumerable.ToLookup](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.tolookup?view=net-10.0)

**Before**

```csharp
// First implementation of the new tags column
foreach (var order in orders)
{
    var matches = tags.Where(tag => tag.OrderId == order.Id);
    Write(order, matches.ToArray());
}
```

**After**

```csharp
if (orders.Count == 0) return;
var tagsByOrder = tags.ToLookup(tag => tag.OrderId);
foreach (var order in orders)
    Write(order, tagsByOrder[order.Id].ToArray());
```

The guard keeps an empty order list from reading any tags. The per-order arrays still meet the writer contract. The index removes repeated scans of all tags, provided the tag source is stable, finite and safe to enumerate up front. For a streaming order source, initialize the index on the first order. When the feature inherently adds work, check whether the added behavior warrants it.

## Keep new work required by a changed contract

Suppose a manifest previously listed paths. It must now include a SHA-256 digest of the bytes read for each entry. The base could write a name without opening the file. The new file-system term inside the loop reflects a real feature cost.

```csharp
foreach (string path in paths)
{
    using var input = File.OpenRead(path);
    byte[] digest = SHA256.HashData(input);
    WriteEntry(path, digest);
}
```

Keep the read when the manifest promises the content observed for that entry. Reusing a digest keyed only by a mutable path could publish a stale value. If the exporter already holds the exact bytes for the entry, hashing those bytes can avoid a second read while honoring the same promise. [Microsoft, SHA256.HashData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.sha256.hashdata?view=net-10.0)
