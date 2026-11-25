<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `class-facade`

Awl finds a class that forms one component once calls are included and at least three qualifying groups with call edges removed. Its witnesses tell you which groups a routing operation joins. A GoF Facade can be the intended outcome. Awl rule definition (`docs/class-partitions.md`)

**Keep the Facade, extract the subsystems** when clients need one stable operation but the routed work owns independently changing state. Validation, rendering and delivery can each have a useful boundary. Leave ordering and failure propagation visible in the orchestrator. [Gamma, Helm, Johnson and Vlissides, *Design Patterns*](https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-software-9780201633610) · [Fowler, Service Layer](https://www.martinfowler.com/eaaCatalog/serviceLayer.html)

**Before**

```csharp
void Publish(Draft draft)
{
    Validate(draft);            // uses this publisher's validation rules
    byte[] bytes = Render(draft); // uses its templates
    Deliver(bytes);             // uses its destination settings
}
```

**After**

```csharp
sealed class Publisher(DraftValidator validator, Renderer renderer, Delivery delivery)
{
    public void Publish(Draft draft)
    {
        validator.Validate(draft);
        byte[] bytes = renderer.Render(draft);
        delivery.Send(bytes);
    }
}
```

Clients still make one call, validation still precedes sending, and each subsystem can be exercised directly. Keep an existing thin facade when it already does just this. A mediator or message bus would add delivery and error semantics to a synchronous sequence.

## When the private helpers are pieces of one operation

Suppose `Frame.Seal(payload)` calls `SetLength`, `SetChecksum` and `MarkSealed`. Each helper touches a different field, which can produce three groups connected by `Seal`. If each helper is private and used only there, **Inline Function** can make the protocol easier to read. [Fowler, Inline Function](https://refactoring.com/catalog/inlineFunction.html)

```csharp
public void Seal(ReadOnlySpan<byte> payload)
{
    length = payload.Length;
    checksum = Checksum.Of(payload);
    sealedFrame = true;
}
```

The original order matters. A checksum failure still occurs after assigning the length and before marking the frame sealed. Here one object owns all three fields. Independent validator, renderer and delivery objects made sense for the publisher above because each subsystem had its own behavior and state.
