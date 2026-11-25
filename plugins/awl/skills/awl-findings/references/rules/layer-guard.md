<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `layer-guard`

Awl joins a bound source dependency to the project’s declared layer policy. In a configuration that allows Storage → Orders, a direct Orders → Storage use can produce a finding. The evidence names both declarations and the forbidden direction. Awl rule definition (`docs/declared-layers.md`)

**Ports and Adapters** lets the use case specify its data need in domain terms. The storage adapter translates that request into its own query. Keep database row types, query builders and transaction details on the storage side. [Cockburn, Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) · [Fowler, Gateway](https://martinfowler.com/eaaCatalog/gateway.html)

**Before**

```csharp
// In Orders
bool CanShip(OrderId id, Storage.OrderRows rows) =>
    rows.Fetch(id).StatusCode == "PAID";
```

**After**

```csharp
// In Orders
public interface IPaidOrders { bool IsPaid(OrderId id); }

bool CanShip(OrderId id, IPaidOrders orders) => orders.IsPaid(id);

// In Storage
sealed class PaidOrders(OrderRows rows) : Orders.IPaidOrders
{
    public bool IsPaid(Orders.OrderId id) => rows.Fetch(id).StatusCode == "PAID";
}
```

Every type in the port signature participates in the dependency. Returning a storage row would reintroduce the forbidden edge. When the original edge documents an intended dependency, review the architecture with the owner of the layer policy before changing code.

## When a wire annotation crosses into the domain

A port helps when the inner layer needs an operation. Sometimes it only carries outer-layer metadata. Suppose `Wire.FieldNameAttribute` is an attribute declared by your transport project. Placing `[property: Wire.FieldName("tracking_id")]` on `Domain.Shipment.TrackingId` creates a domain-to-wire dependency even if the domain never calls the serializer. Map the outgoing message at the boundary. [Fowler, Data Transfer Object](https://martinfowler.com/eaaCatalog/dataTransferObject.html)

```csharp
namespace Domain
{
    public sealed record Shipment(string TrackingId);
}
namespace Wire
{
    internal sealed record ShipmentMessage([property: FieldName("tracking_id")] string TrackingId)
    {
        internal static ShipmentMessage From(Domain.Shipment shipment) =>
            new(shipment.TrackingId);
    }
}
```

The sender serializes `ShipmentMessage.From(shipment)`. Clients still receive `tracking_id`, and a wire rename now belongs to `Wire`. If the original domain type also supported incoming messages, preserve that mapping in the transport layer as well.
