<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `response-for-class`

Awl counts the distinct owned member bodies and their direct nominal call targets, including constructors and accessors. Repeated calls to one method count once. Response size describes the surface to reason about when changing the class. Awl rule definition (`docs/class-metrics.md`)

**Extract Class** when several calls implement one protocol. A delivery operation can own serialization, headers, HTTP status and response disposal. A separate notification use case can own recipient policy. The boundary has a result and failure contract you can describe in one sentence. [Fowler, Extract Class](https://refactoring.com/catalog/extractClass.html) · [Fowler, Gateway](https://martinfowler.com/eaaCatalog/gateway.html)

**Before**

```csharp
async Task Notify(Order order, CancellationToken token)
{
    if (!order.Customer.WantsReceipts) return;
    using var message = BuildRequest(order);
    using var reply = await http.SendAsync(message, token);
    reply.EnsureSuccessStatusCode();
}
```

**After**

```csharp
async Task Notify(Order order, CancellationToken token)
{
    if (order.Customer.WantsReceipts)
        await delivery.SendReceipt(order, token);
}

// On ReceiptDelivery, the owner of the HTTP operation
internal async Task SendReceipt(Order order, CancellationToken token)
{
    using var message = BuildRequest(order);
    using var reply = await http.SendAsync(message, token);
    reply.EnsureSuccessStatusCode();
}
```

One place now owns the HTTP protocol, including what counts as success. Reuse an existing delivery owner when there is one. A new helper for each of the three HTTP calls adds more calls to follow and scatters the lifetime of the request and response.

Two Awl examples show how to judge a split. `WorkerServer` delegates request admission and execution while its entry point still shows how a request proceeds. In `BindingFileCapture.Build`, four collaborators successively fill the same extract. To understand how a binding fact reaches the output, a reader may need to follow both the walk that collects it and the collaborator that publishes it. Ask whether the proposed split makes a change like adding one fact easier to locate. Awl’s worker entry point (`src/Awl.Host/Execution/WorkerServer.cs`) · Awl’s binding capture (`src/Awl.Semantics/Binding/BindingFileCapture.cs`)

## When most of the targets are pass-through calls

Suppose `ShippingDesk.FindCarrier(code)` only returns `catalog.Find(code)`. It has accumulated similar pass-throughs for the picker, the reporting page and the routing job. If the catalog is already a stable API available to those callers, **Remove Middle Man** lets a caller use the lookup directly. [Fowler, Remove Middle Man](https://refactoring.com/catalog/removeMiddleMan.html)

```csharp
sealed class CarrierPicker(ICarrierCatalog catalog)
{
    public string DisplayName(string code) =>
        catalog.Find(code)?.DisplayName ?? "Unknown carrier";
}
```

The picker keeps its original missing-carrier behavior. If all consumers can migrate, remove the unused forwarding member from `ShippingDesk`. Keep a facade that enforces authorization, transaction scope or an external API promise. Bypassing that operation would change what callers are allowed to do.
