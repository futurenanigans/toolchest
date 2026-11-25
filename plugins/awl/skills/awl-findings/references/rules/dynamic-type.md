<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `dynamic-type`

Awl covers declarations containing dynamic and operations dispatched dynamically. Follow the value back to its origin. JSON, COM and scripting boundaries often supply values that the rest of the application can treat as ordinary typed data. Awl rule definition (`docs/reliability-binding.md`)

**Adapter at the boundary.** Convert a known wire schema once, validate the fields the application requires, and return a domain value. For a genuine interop API that requires dynamic dispatch, concentrate the binding and error translation in that adapter. [Microsoft, Deserialize JSON into .NET types](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/deserialization) · [Gamma, Helm, Johnson and Vlissides, *Design Patterns*](https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-software-9780201633610)

**Before**

```csharp
// A dynamic deserializer or interop API produced payment.
decimal Total(dynamic payment) => payment.amount;
```

**After**

```csharp
sealed record WirePayment(decimal? Amount);

static decimal ReadTotal(string json)
{
    var payment = JsonSerializer.Deserialize<WirePayment>(
        json, JsonSerializerOptions.Web);
    return payment?.Amount ?? throw new JsonException("A payment amount is required.");
}
```

The nullable field distinguishes a missing amount from a payment of zero. The example assumes a JSON number named `amount`. Check number formats, casing and unknown-schema handling when adapting a real protocol. A cast to `object` alone just shifts the binding question downstream.

## When application types already share a capability

If a total loops over `IEnumerable<dynamic>` and reads `charge.Amount` from each item, check whether you own the providers. They can implement one checked contract even when one stores its amount and another calculates it.

```csharp
interface ICharge { decimal Amount { get; } }

sealed record FixedCharge(decimal Amount) : ICharge;

sealed record UsageCharge(decimal Units, decimal UnitPrice) : ICharge
{
    public decimal Amount => Units * UnitPrice;
}

static class Billing
{
    public static decimal Sum(IEnumerable<ICharge> charges) =>
        charges.Sum(charge => charge.Amount);
}
```

The total assumes both amounts have the same currency and meaning. If a third-party provider uses a different representation, its adapter can translate the value.
