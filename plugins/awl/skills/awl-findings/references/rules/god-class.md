<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `god-class`

Awl combines high method weight, many distinct foreign data targets and low tight class cohesion. Read the three dimensions together. A large cohesive algorithm and a short object with many fields present different problems. Awl rule definition (`docs/class-collaborators.md`)

Move the first real **domain invariant** to the object that can enforce it, then leave **application-service orchestration** at the edge. If many operations repeat customer credit arithmetic, make the account own the arithmetic and reservation. Keep loading and saving in the application service. [Fowler, Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html) · [Fowler, Service Layer](https://www.martinfowler.com/eaaCatalog/serviceLayer.html)

**Before**

```csharp
void Reserve(AccountId id, decimal amount)
{
    var account = accounts.Load(id);
    if (amount > account.Limit - account.Reserved)
        throw new InvalidOperationException("Credit limit exceeded.");
    account.Reserved += amount;
    accounts.Save(account);
}
```

**After**

```csharp
// On Account
public void Reserve(decimal amount)
{
    if (amount > Limit - Reserved)
        throw new InvalidOperationException("Credit limit exceeded.");
    Reserved += amount;
}

// In the application service
void Reserve(AccountId id, decimal amount)
{
    var account = accounts.Load(id);
    account.Reserve(amount);
    accounts.Save(account);
}
```

The account can make the setter private once all writers go through it. Preserve the existing concurrency and transaction boundary around load and save. Pulling the condition into a static utility while leaving every caller free to write `Reserved` does little for cohesion.

## When a single service owns unrelated workflows

Suppose the witnesses cluster around two operations in `OrderAdministration`. One scans open invoices and sends reminders. The other records deliveries against shipments. Separate those entry points and their dependencies while keeping the domain decisions next to the data that determines them. [Bogard, Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)

```csharp
sealed class RemindOverdue(IInvoices invoices, IReminders reminders)
{
    public void Run(DateOnly today)
    {
        foreach (var invoice in invoices.Open())
            if (invoice.IsOverdueOn(today)) reminders.Send(invoice.Id);
    }
}

sealed class RecordDelivery(IShipments shipments)
{
    public void Run(TrackingId id, DateOnly date)
    {
        var shipment = shipments.Find(id);
        shipment.RecordDelivery(date);
        shipments.Save(shipment);
    }
}
```

A new reminder schedule now has a clear home, and recording a delivery still modifies and saves one shipment. If two steps are required to succeed in one transaction, keep the operation coordinating that transaction even when its underlying decisions move.
