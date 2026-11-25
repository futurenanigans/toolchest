<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `multiplicative-work`

Awl reports element comparisons with at least two supported size factors, including an iteration. Start with the two factors and the call path in the finding. Determine which collection the inner operation actually traverses on each outer iteration. Awl rule definition (`docs/performance-families.md`)

## Is this a false positive?

An owner’s own children, or an existing lookup bucket selected by that owner, can partition the input. Suppose each measured line belongs to one member and each member occurs once. This already visits each line once.

```csharp
foreach (var member in distinctMembers)
{
    if (!linesByMember.TryGetValue(member.Id, out var lines)) continue;
    foreach (var line in lines)
        if (line.Hits > 0) RecordHit(member, line);
}
```

Buckets of 2, 0 and 3 lines give five line visits and three lookups. The inner work is the **sum of bucket sizes**. The same reasoning applies to `foreach (var line in member.Lines)` when each line belongs to one visited member. If a finding treats all lines as an independent scan for each member, keep the traversal. Awl’s coverage attribution groups each measured line by its owning member. Coverage attribution (`src/Awl.Semantics/Observations/CoverageAttribution.cs`) · How Awl follows iteration values and lookup keys (`docs/performance-costs.md#source-summaries`)

Check two details before accepting that conclusion.

- **Repeated scans.** If several outer items revisit the same large bucket, count each visit. If every member runs `allLines.Where(line => line.MemberId == member.Id)`, each enumeration examines the whole input even when the results are disjoint. That is a reason to index.
- **Fixed bounds.** Comparing each input with a fixed array of four candidates costs at most four comparisons per input. A fixed cap on the *output* of a filter can still require scanning the full source to find four matches. Locate the bound on the work itself.

Use the source revision named in the report. Awl already recognizes several element-derived and fixed-size shapes. If the reported call path still gives a once-visited bucket an independent growth factor, the size model is the part to investigate.

## Index a collection that really is searched repeatedly

**Index once, probe many times.** For membership, build a set of allowed keys. For a one-to-many equality match, build a lookup that retains all values for each key. Preserve the original input sequence where output order or duplicate inputs matter. [Microsoft, HashSet.Contains](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.hashset-1.contains?view=net-10.0) · [Microsoft, Enumerable.ToLookup](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.tolookup?view=net-10.0)

**Before**

```csharp
// allowed is a List<string> using default string equality.
foreach (var order in orders)
{
    if (allowed.Contains(order.Region))
        Emit(order);
}
```

**After**

```csharp
var allowedRegions = new HashSet<string>(allowed, StringComparer.Ordinal);
foreach (var order in orders)
{
    if (allowedRegions.Contains(order.Region))
        Emit(order);
}
```

With stable inputs and ordinary hash behavior, this changes up to orders × allowed comparisons into one index build and one expected constant-time probe per order. A set costs memory and can lose on tiny inputs. If callers need every matching row, preserve the values and their order in a lookup. [Worked one-to-many example](introduced-expensive-work.md)

## Counting scores at or below successive cutoffs

A set answers equality questions. A score report asks how many scores are at or below each cutoff, including duplicates. The straightforward implementation starts over for every cutoff.

```csharp
foreach (int cutoff in cutoffs)
{
    int count = 0;
    foreach (int score in scores)
        if (score <= cutoff) count++;
    Emit(cutoff, count);
}
```

If both inputs already arrive in ascending order, the boundary only moves forward. Remember its position in the stable `List<int>` of scores.

```csharp
int count = 0;
foreach (int cutoff in cutoffs)
{
    while (count < scores.Count && scores[count] <= cutoff)
        count++;
    Emit(cutoff, count);
}
```

Scores `[2, 2, 5]` and cutoffs `[1, 2, 2]` produce counts `[0, 2, 2]`. Each score passes the boundary at most once, giving linear work across the two inputs and constant extra space. If cutoff order is arbitrary and observable, sorting it would change the report. An upper-bound search on the sorted scores can answer each cutoff independently in its original order.
