<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `cognitive-complexity`

Awl scores nesting, control-flow constructs, logical-operator runs and nominal call cycles in a function. Follow the deepest path and identify which checks merely decide whether the rest of the method applies. Awl rule definition (`docs/design-metrics.md`)

**Guard clauses** move the early exits next to the conditions that justify them. Keep the original order of checks, especially where they authorize access or can throw. Use Split Phase if a distinct validation stage produces a value the next stage can rely on. [Fowler, Replace Nested Conditional with Guard Clauses](https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html) · [Fowler, Split Phase](https://refactoring.com/catalog/splitPhase.html)

**Before**

```csharp
void Renew(Account? account)
{
    if (account is not null)
    {
        if (account.Enabled)
        {
            if (account.IsDue) billing.Renew(account);
        }
    }
}
```

**After**

```csharp
void Renew(Account? account)
{
    if (account is null) return;
    if (!account.Enabled) return;
    if (!account.IsDue) return;

    billing.Renew(account);
}
```

The reader reaches the operation with all three preconditions established. The number of business checks stays the same. Retain explicit branches where different cases need different outcomes or must share cleanup.

## When filtering and handling are nested together

A dispatcher that loops over orders and their lines, checks holds and quantities, and then selects a carrier forces the reader to track eligibility while reading delivery code. Extract the eligibility traversal as a lazy sequence.

```csharp
static IEnumerable<OrderLine> LinesToShip(IEnumerable<Order> orders)
{
    foreach (var order in orders)
    {
        if (order.IsHeld) continue;
        foreach (var line in order.Lines)
            if (line.Quantity > 0) yield return line;
    }
}

void Dispatch(IEnumerable<Order> orders)
{
    foreach (var line in LinesToShip(orders))
    {
        if (line.RequiresColdChain) cold.Send(line);
        else regular.Send(line);
    }
}
```

Yielding each line preserves input order and sends it before examining the next one. If a send fails, later orders are still unread, just as in the original nested loop. Materializing the selection up front would change that behavior. [Microsoft, Iterator execution](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/yield)
