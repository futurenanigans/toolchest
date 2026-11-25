<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `test-co-change`

Awl measures how often a loaded source document changed without another document from a test project that reaches it changing in the same commit. It needs a configured history window. A stable existing test can already cover a change. Awl rule definition (`docs/change-history.md`)

**Specification by Example** is useful when a behavior change has no corresponding assertion. Read the actual diff and identify the smallest example that distinguishes the old contract from the new one. Keep existing tests untouched when they already express it. [Fowler, Specification by Example](https://martinfowler.com/bliki/SpecificationByExample.html) · [Microsoft, Unit testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)

**Before**

```csharp
// Requirement changed from strictly over 50 to 50 or more.
public bool ShipsFree(decimal subtotal) => subtotal >= 50m;

// Existing example only exercised 75.
Assert.True(policy.ShipsFree(75m));
```

**After**

```csharp
[Theory]
[InlineData(49, false)]
[InlineData(50, true)]
[InlineData(75, true)]
public void FreeShippingStartsAtFifty(int subtotal, bool expected)
{
    Assert.Equal(expected, policy.ShipsFree(subtotal));
}
```

The equality case distinguishes the two contracts.

## Keep an existing example through an internal refactor

Suppose the suite already checks subtotals of 49, 50 and 75. A later edit gives the threshold a name while preserving both the comparison and its observable result.

```csharp
private const decimal FreeShippingMinimum = 50m;

public bool ShipsFree(decimal subtotal) => subtotal >= FreeShippingMinimum;
```

The existing equality case would still distinguish `>=` from `>`. Leave that test as written. The production-only edit increases the historical count without creating a missing behavioral example.
