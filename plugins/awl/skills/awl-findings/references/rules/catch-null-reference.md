<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `catch-null-reference`

Awl reports a catch that binds to the framework NullReferenceException, including a filtered catch. A catch surrounding several operations cannot distinguish an absent input from a defect inside one of those operations. Awl rule definition (`docs/reliability-exceptions.md`)

**Represent optional input explicitly.** At the boundary that accepts absence, choose the empty-case behavior. Where a value is mandatory, validate once and pass a non-null value into the core. [Microsoft, Nullable static analysis attributes](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/nullable-analysis) · [Microsoft, Using standard exception types](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/using-standard-exception-types)

**Before**

```csharp
string Label(Customer? customer)
{
    try { return customer!.FormatLabel(); }
    catch (NullReferenceException) { return "Guest"; }
}
```

**After**

```csharp
string Label(Customer? customer) =>
    customer is null ? "Guest" : customer.FormatLabel();
```

An absent customer still renders as Guest. A broken formatter now propagates its own failure and retains its stack, which makes the two cases distinguishable. If the formatter is allowed to produce an absent label, express that separately in its return type.

## Reject a missing required argument

An invoice addressed to a registered customer cannot use the guest label. If a catch previously returned `"Guest"` here too, change the boundary to express who must supply the customer. A non-nullable parameter informs C# callers, and the guard also checks the value at runtime. [Microsoft, ArgumentNullException.ThrowIfNull](https://learn.microsoft.com/en-us/dotnet/api/system.argumentnullexception.throwifnull?view=net-10.0)

```csharp
public string InvoiceLabel(Customer customer)
{
    ArgumentNullException.ThrowIfNull(customer);
    return customer.FormatLabel();
}
```

A missing argument now identifies `customer` at the call boundary. An exception inside `FormatLabel` still identifies the failing operation.
