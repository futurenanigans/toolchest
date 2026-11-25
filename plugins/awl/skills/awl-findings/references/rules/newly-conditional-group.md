<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `newly-conditional-group`

Awl compares supported production routes across revisions and finds methods that now require a particular selector on every route. Read the new condition, its polarity and the base witness. An intentional rollout and an accidental narrowing can produce the same shape. Awl rule definition (`docs/conditional-reachability.md`)

**Isolate the feature decision** at the boundary of the behavior it owns. A receipt flag may control emailing after checkout while payment capture remains mandatory. A genuinely optional implementation can instead be selected by a Strategy at composition. [Hodgson, Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) · [Gamma, Helm, Johnson and Vlissides, *Design Patterns*](https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-software-9780201633610)

**Before**

```csharp
// Payment used to run for every completed checkout.
void Complete(Order order)
{
    if (options.EmailReceipts)
    {
        payments.Capture(order);
        receipts.Send(order);
    }
}
```

**After**

```csharp
void Complete(Order order)
{
    payments.Capture(order);
    if (options.EmailReceipts)
        receipts.Send(order);
}
```

Check the disabled case as well as the enabled case. If guarded payment is itself the explicit rollout goal, keep the condition and make the two behaviors testable. Adding an otherwise unused production call just to supply an unguarded route would misdescribe how the system works.
