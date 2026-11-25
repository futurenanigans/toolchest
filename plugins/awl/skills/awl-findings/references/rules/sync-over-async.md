<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `sync-over-async`

Awl identifies synchronous owners that consume a task through Result, Wait or a supported awaiter. Look outward from the reported function until you find the host or framework entry point that sets the execution contract. Awl rule definition (`docs/reliability-blocking.md`)

**Propagate the asynchronous contract** to the entry point. Modern C# console programs can return `Task<int>` from Main. A genuinely synchronous API can use an actual synchronous implementation if the dependency offers one. [Microsoft, Asynchronous programming scenarios](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios) · [Microsoft, Async return types](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-return-types)

**Before**

```csharp
static int Main(string[] args)
{
    Report report = client.LoadAsync(args[0]).GetAwaiter().GetResult();
    return Print(report);
}
```

**After**

```csharp
static async Task<int> Main(string[] args)
{
    Report report = await client.LoadAsync(args[0]);
    return Print(report);
}
```

Keep cancellation and exceptions observable at the same public boundary. Changing `Result` to `GetAwaiter().GetResult()` still blocks a thread. A synchronous interface imposed by a third party may warrant a documented integration boundary and a review finding.

## When a callback has to stay synchronous

A sort key selector cannot await an exchange-rate lookup. Calling `rates.GetAsync(invoice.Currency).GetAwaiter().GetResult()` inside `OrderBy` makes each key extraction block on I/O. If prices for the batch must use one exchange-rate snapshot, obtain it before sorting.

```csharp
async Task<Invoice[]> ByBaseAmountAsync(IReadOnlyList<Invoice> invoices, CancellationToken token)
{
    if (invoices.Count == 0) return [];
    var currencies = invoices.Select(invoice => invoice.Currency).Distinct();
    var snapshot = await rates.SnapshotAsync(currencies, token);
    return invoices.OrderBy(invoice => invoice.Total * snapshot[invoice.Currency]).ToArray();
}
```

The selector is synchronous and reads only local data. A missing exchange rate must follow the batch’s documented failure policy. This approach assumes the input is stable and one rate per currency is valid throughout the sort. [Fowler, Split Phase](https://refactoring.com/catalog/splitPhase.html)
