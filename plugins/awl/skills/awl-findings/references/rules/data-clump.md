<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `data-clump`

Awl follows bound argument forwarding and reports a set of at least three values held together by multiple declarations. The evidence shows holders and forwarding sites. Matching parameter names alone establish no clump. Awl rule definition (`docs/data-clumps.md`)

**Introduce Parameter Object** across the forwarding chain. If the values are already properties of the same domain object, pass that object when it is a suitable dependency. Use a narrower immutable value when the downstream operation needs only these fields. [Fowler, Introduce Parameter Object](https://refactoring.com/catalog/introduceParameterObject.html) · [Fowler, Value Object](https://martinfowler.com/bliki/ValueObject.html)

**Before**

```csharp
void Queue(string tenant, string bucket, string key) =>
    worker.Run(tenant, bucket, key);

// On the worker
internal void Run(string tenant, string bucket, string key) =>
    storage.Remove(tenant, bucket, key);
```

**After**

```csharp
public sealed record ObjectKey(string Tenant, string Bucket, string Name);

void Queue(ObjectKey key) => worker.Run(key);

// On the worker
internal void Run(ObjectKey key) => storage.Remove(key);
```

Update the producer and storage consumer as well. If an external storage API requires three arguments, unpack once in its adapter. Preserve each component’s case and equality semantics if the new value will also be used as a dictionary key.

## When the fields already belong to an immutable value

The print job unpacks one `PostalAddress` into street, city and postcode. Its label writer forwards the same fields to a formatter. If each needs the whole address and already belongs to the same domain, preserve the existing value across the calls. [Fowler, Preserve Whole Object](https://refactoring.com/catalog/preserveWholeObject.html)

```csharp
void Print(PostalAddress address) => labels.Write(address.Street, address.City, address.Postcode);

// On the label writer
internal void Write(string street, string city, string postcode) =>
    printer.WriteLine(Format(street, city, postcode));
string Format(string street, string city, string postcode) => $"{street}, {city} {postcode}";
```

The existing address now reaches the writer intact.

```csharp
void Print(PostalAddress address) => labels.Write(address);

// On the label writer
internal void Write(PostalAddress address) => printer.WriteLine(Format(address));
string Format(PostalAddress address) => $"{address.Street}, {address.City} {address.Postcode}";
```

The label retains its original punctuation and ordering. Passing a mutable customer entity that happens to contain the address would give the writer unrelated data and could change when address updates become visible. Keep the immutable address, or project only the fields that may cross the boundary.
