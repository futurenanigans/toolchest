<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `cyclomatic-complexity`

Awl counts bound decisions in one function. A constant/discard switch expression with no guards is treated as one lookup. A less nested spelling can still contain the same number of decisions. Awl rule definition (`docs/design-metrics.md`)

Use a **decision table** for independent keys with fixed results. List the boundary behavior, including the unknown key. When the branches select families of multi-step algorithms, **Strategy** can put each algorithm and its dependencies in one place. [Microsoft, C# pattern matching](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/patterns/pattern-matching) · [Fowler, Replace Conditional with Polymorphism](https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html) · [Gamma, Helm, Johnson and Vlissides, *Design Patterns*](https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-software-9780201633610)

**Before**

```csharp
static int RetryLimit(string operation)
{
    if (operation == "read") return 3;
    if (operation == "refresh") return 2;
    if (operation == "publish") return 1;
    throw new ArgumentException("Unknown operation.", nameof(operation));
}
```

**After**

```csharp
static int RetryLimit(string operation) => operation switch
{
    "read" => 3,
    "refresh" => 2,
    "publish" => 1,
    _ => throw new ArgumentException("Unknown operation.", nameof(operation))
};
```

A table works because the three keys are mutually exclusive and the answers carry no effects. Preserve evaluation order when conditions overlap or perform I/O. A class per constant would make this table harder to inspect.

## When each branch implements a different algorithm

Suppose checkout branches on the shipping service in two places. One branch calculates weight times a zone rate. Another consults the customer’s carrier contract. Give each calculation its own **Strategy** and let the code that selects a shipping service supply it to checkout.

```csharp
interface IPostage { decimal Fee(Parcel parcel); }

sealed class ZonePostage(RateCard rates) : IPostage
{
    public decimal Fee(Parcel parcel) => rates.For(parcel.Zone) * parcel.WeightKg;
}

sealed class ContractPostage(CarrierContracts contracts) : IPostage
{
    public decimal Fee(Parcel parcel) => contracts.For(parcel.AccountId).Price(parcel);
}

sealed class Checkout(IPostage postage)
{
    public decimal Total(Order order) => order.Subtotal + postage.Fee(order.Parcel);
}
```

The selection point still needs its defined outcome for an unknown service. The gain is that a new carrier price changes a single calculation and checkout can use it consistently. [Fowler, Replace Conditional with Polymorphism](https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html)
