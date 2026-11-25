<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `measured-benchmark-change`

Awl pairs imported BenchmarkDotNet observations by benchmark identity and comparable environment. It can report an increase in allocated bytes or a higher time mean when the current lower confidence bound exceeds the baseline upper bound. The finding identifies the benchmark, workload and quantity. Awl rule definition (`docs/performance-measurements.md`)

## Is this a false positive?

Read the two supplied measurements before attributing the difference to a code change. Check the inputs and setup behind the recorded benchmark identity. For example, a queue benchmark may prepare ten items in one revision and a thousand in the other under the same name and parameters. Both measurements can be accurate while answering different questions. This rule compares the imported observations. Measurement limits (`docs/performance-measurements.md#rule`)

## Trace an allocation increase to a copy

Keep a **benchmark of the public operation** with representative inputs and equivalent setup on both sides. Inspect the changed path for a cause of the observed quantity. For an extra array allocation, consuming an existing span directly is one concrete repair. [BenchmarkDotNet, Baselines](https://benchmarkdotnet.org/articles/features/baselines.html) · [BenchmarkDotNet, Good practices](https://benchmarkdotnet.org/articles/guides/good-practices.html)

**Before**

```csharp
static int CountZeros(ReadOnlySpan<byte> data)
{
    int count = 0;
    foreach (byte value in data.ToArray())
        if (value == 0) count++;
    return count;
}
```

**After**

```csharp
static int CountZeros(ReadOnlySpan<byte> data)
{
    int count = 0;
    foreach (byte value in data)
        if (value == 0) count++;
    return count;
}
```

Both implementations handle the same input and return the same count. The second removes the explicit copy. Whether it explains an observed regression depends on where the measured benchmark spends its work. Changing the benchmark’s data size or moving work into setup would answer a different question.

## Investigate a time increase with unchanged allocation

Suppose the imported result shows longer lookups, with the same bytes allocated per operation. A change on the measured path replaced a binary search with `Array.IndexOf(sortedIds, id) >= 0`. On a large table a missing ID now requires a full scan. If the producer already guarantees ascending numeric order, the membership operation can use binary search again.

```csharp
static bool ContainsId(int[] sortedIds, int id) =>
    Array.BinarySearch(sortedIds, id) >= 0;
```

Both versions return a Boolean and handle duplicates. The cost difference depends on table size and where hits occur. A fair comparison uses the same table and the same mix of hits and misses. If production has to sort a fresh array for every query, that sort belongs in the measured operation too. [Microsoft, Array.BinarySearch](https://learn.microsoft.com/en-us/dotnet/api/system.array.binarysearch?view=net-10.0) · [BenchmarkDotNet, Good practices](https://benchmarkdotnet.org/articles/guides/good-practices.html)
