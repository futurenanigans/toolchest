<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `untested-throw`

Awl reports an authored throw with an operand when its containing function is unreached from tests in every loaded copy. A bare rethrow passes on an existing failure and falls outside the rule. A call alone cannot establish that the exceptional branch ran. Drive the specific input that must fail and inspect the observable failure. Awl rule definition (`docs/test-reachability.md`)

**Test the failure contract** at the nearest public operation that promises it. Check the exception type and meaningful structured details. Protect the successful boundary in a separate case if an off-by-one change could break it. [xUnit.net, Assert.Throws](https://api.xunit.net/v3/3.0.0/v3.3.0.0-Xunit.Assert.Throws.html) · [Microsoft, Unit testing best practices](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)

**Before**

```csharp
public void AddSeats(int count)
{
    if (count < 1) throw new ArgumentOutOfRangeException(nameof(count));
    seats += count;
}
```

**After**

```csharp
[Fact]
public void ZeroSeatsAreRejectedWithoutChangingTheBooking()
{
    var booking = new Booking();
    var error = Assert.Throws<ArgumentOutOfRangeException>(() => booking.AddSeats(0));
    Assert.Equal("count", error.ParamName);
    Assert.Equal(0, booking.Seats);
}
```

A success-only test can give Awl a path to the same function. The assertion here distinguishes the relevant failure path and checks the state after it. For an asynchronous API, await an asynchronous exception assertion so late failures reach the test.

## Exercise a throw that the public boundary handles

An importer’s private parser throws `FormatException` for an invalid quantity. The supported import operation catches that error before appending a row and returns `InvalidQuantity`. Drive the parser from that entry point and assert the outcome a caller receives.

```csharp
[Fact]
public void MalformedQuantityLeavesTheImportEmpty()
{
    var rows = new InMemoryRows();
    var importer = new Importer(rows);

    Assert.Equal(ImportStatus.InvalidQuantity, importer.Import("abc"));
    Assert.Empty(rows.Items);
}
```

Choose input that reaches the reported throw. This example protects rejection without side effects even if the importer later changes how its parser signals invalid input.
