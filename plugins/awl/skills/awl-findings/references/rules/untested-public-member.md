<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `untested-public-member`

Awl found an externally visible production member with no established static path from a Test-role declaration in the relevant contexts. A static path says nothing about which result a test asserts. Start from the caller-visible behavior the API promises. Awl rule definition (`docs/test-reachability.md`)

Use a **behavioral contract test** through the public entry point. Exercise inputs that distinguish the promised result from an obvious wrong one. Reduce visibility instead when the member was never intended as a public contract and its consumers permit the change. [Microsoft, Unit testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices) · [Fowler, Specification by Example](https://martinfowler.com/bliki/SpecificationByExample.html)

**Before**

```csharp
public sealed class PriceList(decimal unitPrice)
{
    public decimal Total(int quantity) => unitPrice * quantity;
}
```

**After**

```csharp
[Fact]
public void TotalChargesForEveryUnit()
{
    var prices = new PriceList(2.50m);
    Assert.Equal(7.50m, prices.Total(3));
}
```

A call through a higher-level public workflow is also useful if the assertion can expose a defect in this behavior. Constructing the type, exercising a mock of it, or asserting a value computed by the implementation itself supplies much weaker evidence.

## Close an accidental public API

Suppose `Receipt.FormatAmount` was exposed during development, and the only supported operation is `PrintTotal`. After confirming the helper has no external callers or compatibility obligation, make it private and exercise the observable receipt text.

```csharp
public sealed class Receipt
{
    public string PrintTotal(decimal amount) => $"Total {FormatAmount(amount)}";

    private static string FormatAmount(decimal amount) =>
        amount.ToString("0.00", CultureInfo.InvariantCulture);
}

[Fact]
public void ReceiptIncludesCents() =>
    Assert.Equal("Total 2.50", new Receipt().PrintTotal(2.5m));
```

This keeps output formatting covered while allowing the helper to change. External library callers may be invisible to Awl, so confirm the public contract before narrowing visibility.
