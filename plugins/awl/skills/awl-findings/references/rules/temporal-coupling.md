<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `temporal-coupling`

Awl identifies pairs of loaded documents retained in production scope that repeatedly change in the same commits within the configured history window. Read several shared changes and look for a decision both sides have to rediscover. Commit membership alone gives no causal direction. Awl rule definition (`docs/change-history.md`)

**Give duplicated knowledge one owner.** If both a quote and an invoice must implement the same eligibility rule, let a domain policy own the boundary value. If a wire producer and an independently implemented consumer co-change because their shared contract evolves, version or test that contract at the boundary. [Fowler, Move Function](https://refactoring.com/catalog/moveFunction.html) · [Tornhill, Code Maat coupling analysis](https://github.com/adamtornhill/code-maat#mining-logical-coupling)

**Before**

```csharp
// In the quoting and invoicing features respectively
decimal QuoteFee(int units) => units >= 50 ? 0m : 4m;
decimal InvoiceFee(int units) => units >= 50 ? 0m : 4m;
```

**After**

```csharp
static class HandlingFee
{
    public static decimal For(int units) => units >= 50 ? 0m : 4m;
}

decimal QuoteFee(int units) => HandlingFee.For(units);
decimal InvoiceFee(int units) => HandlingFee.For(units);
```

Extract this policy only if the same owner promises the same price at both stages. A bulk rename can also explain the history. Combining files or splitting commits changes the statistic without changing those responsibilities.

## Protect an intentional wire contract between independent releases

A receipt writer and reader may change together to add wire fields. Clients outside the repository still send the published JSON. Keep independent examples of what the writer must emit and what the reader must continue accepting. [Robinson, Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html)

```csharp
using var output = JsonDocument.Parse(ReceiptWriter.Write(new Receipt(42)));
Assert.Equal(42, output.RootElement.GetProperty("orderId").GetInt32());

const string publishedReceipt = """{"orderId":42}""";
Assert.Equal(42, ReceiptReader.Read(publishedReceipt).OrderId);
```

A round-trip using only today’s writer and reader would still pass if both renamed `orderId` together. The writer assertion detects that break and allows extra fields. The reader assertion protects previously published input. Continued co-change can be appropriate for the two sides of a published contract.
