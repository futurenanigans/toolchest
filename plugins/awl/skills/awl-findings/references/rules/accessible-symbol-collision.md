<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `accessible-symbol-collision`

Awl shows an unqualified use, the symbol that won lookup and the accessible same-named declaration it hid. A source type hiding an imported type and a local hiding a member are two distinct cases. Awl rule definition (`docs/symbol-collisions.md`)

**Rename by role** when the two declarations mean different things. A local representing pending work can name that stage explicitly. For two externally fixed type names, a C# using alias at the integration boundary can express exactly which representation crosses it. [Fowler, Rename Variable](https://refactoring.com/catalog/renameVariable.html) · [Microsoft, Using directives and aliases](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-directive)

**Before**

```csharp
sealed class Batch
{
    private int count;
    public void Append(IEnumerable<Row> rows)
    {
        int count = rows.Count();
        Audit(count);
        this.count += count;
    }
}
```

**After**

```csharp
sealed class Batch
{
    private int count;
    public void Append(IEnumerable<Row> rows)
    {
        int incomingCount = rows.Count();
        Audit(incomingCount);
        count += incomingCount;
    }
}
```

Check the binding at every witness before renaming. A rename of a public symbol can also affect external callers and serialization conventions.

## When two public types must keep their names

An adapter in `Shipping` imports `Vendor.Protocol`. Its unqualified `Order` parameter binds to the source type `Shipping.Order` and hides the imported `Vendor.Protocol.Order`. Both names are published contracts. Keep them and use explicit aliases at this boundary. [Microsoft, Using directives and aliases](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-directive)

```csharp
using DomainOrder = global::Shipping.Order;
using WireOrder = global::Vendor.Protocol.Order;

namespace Shipping;

static class OrderMessage
{
    internal static WireOrder Encode(DomainOrder order) => new(order.Number);
}
```

Previously the signature could read `Vendor.Protocol.Order Encode(Order order)`. The aliases preserve both parameter and return types, and the call to the wire constructor is visible at its use. If the witness reveals that the old signature already bound to the wrong type, correcting that signature is a behavior change.
