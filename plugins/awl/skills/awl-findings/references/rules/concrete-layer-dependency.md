<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `concrete-layer-dependency`

Awl reports a constructor parameter whose type is a concrete class in a declared layer that depends on the constructor's own layer, when that class implements an interface or extends an abstract class the constructor's layer is allowed to use. The evidence names both layers, the parameter and the abstraction. The rule needs an `analysis.layers` policy. Awl rule definition (`docs/pattern-pressures.md`)

**Depend on the abstraction** by changing the parameter type to the listed interface or abstract class. The inner layer then compiles without the outer one, and the composition root chooses the implementation. [Martin, The Dependency Inversion Principle](https://web.archive.org/web/20110714224327/http://www.objectmentor.com/resources/articles/dip.pdf) · [Seemann, Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)

**Before**

```csharp
// In Orders (inner layer)
public interface IOrderStore { Order Find(OrderId id); }

public sealed class ShipOrder(Storage.SqlOrderStore store)
{
    public void Run(OrderId id) => store.Find(id).Ship();
}

// In Storage (outer layer, allowed to depend on Orders)
public sealed class SqlOrderStore(DbConnection connection) : Orders.IOrderStore { /* ... */ }
```

**After**

```csharp
// In Orders
public sealed class ShipOrder(IOrderStore store)
{
    public void Run(OrderId id) => store.Find(id).Ship();
}
```

`ShipOrder` no longer names a storage type, so replacing the SQL store changes only the registration.

## When the use case needs a member the abstraction lacks

Suppose `ShipOrder` calls `SqlOrderStore.FindForUpdate`, which `IOrderStore` does not declare. Changing the parameter type alone does not compile. Decide whether the missing operation belongs to the use case's contract. If it does, add it to the interface in the inner layer's terms.

```csharp
public interface IOrderStore
{
    Order Find(OrderId id);
    Order Reserve(OrderId id);
}
```

`Reserve` states what the use case needs, and the storage adapter decides that it takes a row lock.
