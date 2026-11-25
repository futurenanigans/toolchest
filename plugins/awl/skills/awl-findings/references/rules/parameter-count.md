<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `parameter-count`

Awl counts bound value parameters on eligible, changeable signatures. It treats a constructor warning as a prompt to inspect dependencies. A long list of service dependencies and a long list of pieces of one value need different remedies. Awl rule definition (`docs/design-metrics.md`)

**Introduce Parameter Object** when the values have a common name, travel together and obey a shared rule. Put validation where the value is constructed. For a constructor taking unrelated services, split the responsibilities that require them. [Fowler, Introduce Parameter Object](https://refactoring.com/catalog/introduceParameterObject.html) · [Seemann, On Constructor Over-injection](https://blog.ploeh.dk/2018/08/27/on-constructor-over-injection/)

**Before**

```csharp
Page Read(string query, int offset, int limit, SortOrder order,
          bool includeDrafts, CancellationToken token) =>
    search.Read(query, offset, limit, order, includeDrafts, token);
```

**After**

```csharp
public sealed record PageWindow
{
    public PageWindow(int offset, int limit)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(offset);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(limit);
        Offset = offset;
        Limit = limit;
    }
    public int Offset { get; }
    public int Limit { get; }
}

Page Read(string query, PageWindow page, SortOrder order,
          bool includeDrafts, CancellationToken token) =>
    search.Read(query, page, order, includeDrafts, token);
```

Adopt the same value at the search boundary. Keep cancellation explicit because its lifetime is the request’s. The range checks assume negative offsets and nonpositive limits are invalid in the original contract. A bag of all six parameters would conceal unrelated choices.

## When the parameters are injected services

Suppose the six dependencies of `ReportJobs` fall into two sets. `Send` uses orders, a renderer and mail. `Purge` uses an archive, a retention policy and a clock. A constructor parameter object would still give both operations access to all six. Give each entry point the dependencies it actually uses. [Seemann, On Constructor Over-injection](https://blog.ploeh.dk/2018/08/27/on-constructor-over-injection/)

```csharp
sealed class SendReport(IOrders orders, IReportRenderer renderer, IMail mail)
{
    public void Run(OrderId id) => mail.Send(renderer.Render(orders.Load(id)));
}

sealed class PurgeReports(IArchive archive, IRetentionPolicy retention, IClock clock)
{
    public void Run() => archive.DeleteBefore(retention.Cutoff(clock.UtcNow));
}
```

Startup can wire each job independently. If the same dependencies always cooperate on a single protocol, give that protocol a named operation and expose its result to the original caller.

## When the caller passes a fact the callee already has

If every caller passes the immutable snapshot’s own currency to `Quote`, the extra argument creates a way to ask for contradictory currencies. Read it from the snapshot. [Fowler, Replace Parameter with Query](https://refactoring.com/catalog/replaceParameterWithQuery.html)

```csharp
// Before
Money Quote(OrderSnapshot order, Currency currency) =>
    prices.Quote(order.Lines, currency);

// After
Money Quote(OrderSnapshot order) => prices.Quote(order.Lines, order.Currency);
```

Check every caller first. If a shopper can choose a settlement currency different from the order currency, the second parameter represents an independent choice and belongs in the contract.
