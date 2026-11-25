<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `depth-of-inheritance`

Awl counts the class itself and each base class declared in loaded source, stopping at the first metadata base. Look for intermediate bases whose purpose is to borrow one operation. Also check which clients genuinely require substitutability through the base. Awl rule definition (`docs/class-metrics.md`)

**Composition with Strategy** works when behavior changes independently of the object that uses it. Express the variable calculation as a function or an interface and inject it. Keep a shared base when its state and lifecycle form a real subtype contract. [Fowler, Replace Superclass with Delegate](https://refactoring.com/catalog/replaceSuperclassWithDelegate.html) · [Gamma, Helm, Johnson and Vlissides, *Design Patterns*](https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-software-9780201633610)

**Before**

```csharp
class DomesticQuote : Quote
{
    protected override decimal Fee(decimal amount) => amount * 0.02m;
}
sealed class PartnerQuote : DomesticQuote
{
    protected override decimal Fee(decimal amount) => base.Fee(amount) / 2;
}
```

**After**

```csharp
sealed class QuoteCalculator(Func<decimal, decimal> fee)
{
    public decimal Total(decimal amount) => amount + fee(amount);
}

static decimal DomesticFee(decimal amount) => amount * 0.02m;

var domestic = new QuoteCalculator(DomesticFee);
var partner = new QuoteCalculator(amount => DomesticFee(amount) / 2);
```

The example assumes the inherited total was amount plus fee. Compare all inherited behavior before replacing a public subtype. A delegate suits one calculation. A strategy object earns its place when a policy also owns state, validation or several related operations.

## When an intermediate base adds only a name

Suppose `CsvExport : ScheduledExport` implements `Run`, while `ScheduledExport : ExportJob` has no members. If the middle type has no consumers and no behavior, **Collapse Hierarchy** removes one level while keeping the polymorphic contract used by the scheduler. [Fowler, Collapse Hierarchy](https://refactoring.com/catalog/collapseHierarchy.html)

```csharp
abstract class ExportJob
{
    public abstract void Run();
}

sealed class CsvExport : ExportJob
{
    public override void Run() => CsvFile.Write();
}
```

Check registrations, generic constraints, reflection, type discriminators and external callers for uses of `ScheduledExport`. If callers use it to select scheduled jobs, the type already expresses a distinction they rely on. Deleting an empty body can still change that contract.
