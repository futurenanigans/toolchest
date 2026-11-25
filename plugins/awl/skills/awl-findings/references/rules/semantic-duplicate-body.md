<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `semantic-duplicate-body`

Awl groups equivalent bound operation trees. Literal values and many read names can differ while the shape matches. The comparison starts at 10 explicit bound operations and the default warning is above 19. The snippets below focus on the part of each body that determines whether the callers share a policy. Awl rule definition (`docs/duplicate-bodies.md`)

**Parameterize Function** when two entry points implement one rule with different data. Keep the independently named entry points and make the shared calculation explicit. An optional **Strategy** is useful only if the variation grows into a real algorithm. [Fowler, Parameterize Function](https://refactoring.com/catalog/parameterizeFunction.html) · [Metz, The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)

**Before**

```csharp
decimal DomesticFee(decimal subtotal) =>
    Math.Round(subtotal * 0.02m, 2, MidpointRounding.ToEven);

decimal PartnerFee(decimal subtotal) =>
    Math.Round(subtotal * 0.01m, 2, MidpointRounding.ToEven);
```

**After**

```csharp
static decimal FeeAtRate(decimal subtotal, decimal rate) =>
    Math.Round(subtotal * rate, 2, MidpointRounding.ToEven);

decimal DomesticFee(decimal subtotal) => FeeAtRate(subtotal, 0.02m);
decimal PartnerFee(decimal subtotal) => FeeAtRate(subtotal, 0.01m);
```

Both fees share the same rounding contract in this example. Keep similarly shaped operations separate when they answer to different policies. In particular, an agreement test needs an independent expected result. Sharing the production predicate with its test can make the same mistake appear on both sides.

## When matching bodies implement independent promises

A store’s return window and a support team’s ticket-reopening window currently both last 14 days. Awl can match the operations and literal types even though the product owners make separate promises. These shortened bodies illustrate the comparison.

```csharp
bool CanReturn(Order order, DateOnly today) =>
    !order.FinalSale && today >= order.Delivered &&
    today <= order.Delivered.AddDays(14);

bool CanReopen(Ticket ticket, DateOnly today) =>
    !ticket.PermanentlyClosed && today >= ticket.ClosedOn &&
    today <= ticket.ClosedOn.AddDays(14);
```

If support moves to seven days, only ticket reopening should change. Keep the two policy entry points and their boundary cases independent. An inclusive-date-range helper is reasonable when the date calculation itself becomes subtle and both policies explicitly share its semantics. [Metz, The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
