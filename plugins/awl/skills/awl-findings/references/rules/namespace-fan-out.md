<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `namespace-fan-out`

Awl counts distinct target namespace names declared in the loaded source that a namespace depends on. A registry assembling every rule, such as Awl’s own, has a good reason to know many namespaces. The same fan-out in code that prices one order deserves a closer look. Awl rule definition (`docs/namespace-dependencies.md`)

**Composition Root** works when business code selects or constructs infrastructure. Move the concrete selection to application startup. When the witnesses instead split by user operation, a vertical slice can keep the request, policy and result for each operation together. [Seemann, Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) · [Bogard, Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)

**Before**

```csharp
namespace Orders;
sealed class SendReceipt
{
    public Task Run(Receipt receipt) =>
        new Delivery.Smtp.Sender(
            Config.MailSettings.Read(), new Telemetry.MailLog()).Send(receipt);
}
```

**After**

```csharp
namespace Orders
{
    public interface IReceiptSender { Task Send(Receipt receipt); }
    public sealed class SendReceipt(IReceiptSender sender)
    {
        public Task Run(Receipt receipt) => sender.Send(receipt);
    }
}

namespace Startup
{
    static class Receipts
    {
        internal static Orders.SendReceipt Create()
        {
            var sender = new Delivery.Smtp.Sender(Config.MailSettings.Read(), new Telemetry.MailLog());
            return new Orders.SendReceipt(sender);
        }
    }
}
```

`Delivery.Smtp.Sender` implements the port owned by `Orders`. Configuration and SMTP changes meet at startup. Construct the use case once per request if the sender needs that lifetime. Moving every feature into one namespace would also lower the count while erasing a useful boundary.

## When the outgoing dependencies belong to different use cases

Suppose the reported namespace is `BackOffice.Jobs`. The witnesses for `CapturePayment` go to the payment gateway and ledger. Those for `DispatchOrder` go to packing and dispatch. Neither operation calls the other. Move each job and its behavior into the feature that changes it. The scheduler can continue to invoke both. [Bogard, Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)

```csharp
namespace Payments
{
    sealed class CapturePayment(Gateway gateway, Ledger ledger)
    {
        public void Run(OrderId id) => ledger.Record(id, gateway.Capture(id));
    }
}

namespace Shipping
{
    sealed class DispatchOrder(Packing packing, Dispatch dispatch)
    {
        public void Run(OrderId id) => dispatch.Send(packing.Pack(id));
    }
}
```

Keep the job identifiers and schedules stable if they are part of the external contract. The reason to create two feature namespaces is that changing packing now stays with shipping. A registry that deliberately assembles both jobs can still have high fan-out.
