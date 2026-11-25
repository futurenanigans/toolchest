<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `namespace-cycle`

Awl reports a group of namespace identities that can reach each other through bound dependencies. Read the witness edges in both directions. A return type or constructor parameter can close a cycle just as a method call can. Awl rule definition (`docs/namespace-dependencies.md`)

**Dependency inversion with a port and an adapter.** Checkout owns the operation it needs from billing. The billing adapter implements that operation. Startup already knows both and wires them together. For a cycle caused solely by a shared value, placing that value with its natural owner can be a smaller change. [Cockburn, Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) · [Seemann, Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)

**Before**

```csharp
namespace Checkout
{
    public sealed class PlaceOrder(Billing.CardGateway cards)
    {
        public void Pay(Order order) => cards.Charge(order);
    }
}
namespace Billing
{
    public sealed class CardGateway
    {
        public void Charge(Checkout.Order order) => CardApi.Debit(order.Total);
    }
}
```

**After**

```csharp
namespace Checkout
{
    public interface IChargeCard { void Charge(decimal amount); }

    public sealed class PlaceOrder(IChargeCard cards)
    {
        public void Pay(Order order) => cards.Charge(order.Total);
    }
}
namespace Billing
{
    public sealed class CardGateway : Checkout.IChargeCard
    {
        public void Charge(decimal amount) => CardApi.Debit(amount);
    }
}
```

Here the original billing API used only the amount, in one currency. If billing also needs currency or an idempotency key, put those in the charge contract. Recheck every edge in the reported group. Moving a declaration to a folder leaves its namespace identity intact.

## When a shared value closes the cycle

Suppose `Orders.Totals` needs `Tax.ITaxRates`, whose parameter type lives in `Orders`. Both teams use the same order identifier. Move that value into the existing contracts namespace they both depend on and keep the tax operation where it is.

```csharp
namespace Sales.Contracts
{
    public readonly record struct OrderId(Guid Value);
}
namespace Tax
{
    public interface ITaxRates { decimal For(Sales.Contracts.OrderId id); }
}
namespace Orders
{
    sealed class Totals(Tax.ITaxRates rates)
    {
        internal decimal TaxFor(Sales.Contracts.OrderId id) => rates.For(id);
    }
}
```

The remaining directions are `Orders → Tax`, `Orders → Sales.Contracts` and `Tax → Sales.Contracts`. This works when the identifier is the only dependency from tax back to orders. Check the wire identity and public callers if moving an exposed type. A general-purpose shared namespace would merely collect dependencies whose owners are still unclear.
