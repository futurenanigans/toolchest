<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `newly-orphaned-group`

Awl compares base and target reachability. At least one retained method in the group used to have a possible production route and has now lost its last one. Remaining test-only consumers appear in the evidence. Inspect the removed edge and the requirement it used to serve. Awl rule definition (`docs/newly-orphaned-groups.md`)

**Restore the use-case step** when an edit accidentally dropped required work. A single application operation can own the ordering so callers cannot forget the follow-up. If the feature was deliberately withdrawn, remove the abandoned implementation and retire the tests specific to it. [Fowler, Service Layer](https://www.martinfowler.com/eaaCatalog/serviceLayer.html) · [Fowler, Remove Dead Code](https://refactoring.com/catalog/removeDeadCode.html)

**Before**

```csharp
// The base called RecordReceipt after saving. This edit lost the call.
public void Complete(Order order)
{
    orders.Save(order);
}

private void RecordReceipt(Order order) => receipts.Record(order.Id);
```

**After**

```csharp
public void Complete(Order order)
{
    orders.Save(order);
    RecordReceipt(order);
}

private void RecordReceipt(Order order) => receipts.Record(order.Id);
```

Here the supported completion contract requires both steps. Preserve the original delivery and transaction semantics, including what happens if recording fails.

## Remove a deliberately retired route and its private machinery

Suppose the base selected either a text or a binary writer. The new product contract explicitly rejects binary exports. A comparison can show that deleting the binary arm cut the last production route to the internal `WriteBinary` method even though a test still calls it. Keep the rejection at the entry point and delete the obsolete writer and tests of its binary encoding.

```csharp
public ExportResult Export(Report report, Format format) =>
    format == Format.Text
        ? ExportResult.Written(text.Write(report))
        : ExportResult.Unsupported(format);

[Fact]
public void RetiredBinaryFormatIsRejected()
{
    Assert.Equal(ExportResult.Unsupported(Format.Binary),
        exporter.Export(report, Format.Binary));
}
```

This example assumes text is the only supported format and `ExportResult` has value equality. A public rejection is still a promise worth testing after the encoding implementation is gone.
