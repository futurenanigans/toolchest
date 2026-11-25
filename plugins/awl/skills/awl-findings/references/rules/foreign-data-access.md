<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `foreign-data-access`

Awl counts distinct instance fields and properties read or written outside a class’s own hierarchy on eligible source types. Its policy already excludes plain data carriers and metadata types. Inspect the named targets for a decision that several callers reconstruct. Awl rule definition (`docs/class-foreign-data.md`)

**Move Function** to the owner of the invariant. A subscription already knows its suspension state and paid-through date. Put the renewal decision there, so callers ask a domain question. Keep representation-specific projections in the reporter or adapter that owns that representation. [Fowler, Move Function](https://refactoring.com/catalog/moveFunction.html) · [Fowler, Tell Don't Ask](https://martinfowler.com/bliki/TellDontAsk.html)

**Before**

```csharp
// In the renewal job
bool CanRenew(Subscription s, DateOnly today) =>
    !s.IsSuspended && s.PaidThrough >= today;
```

**After**

```csharp
// On Subscription, which also owns suspension and payment updates
public bool CanRenew(DateOnly today) =>
    !IsSuspended && PaidThrough >= today;

// In the renewal job
if (subscription.CanRenew(today))
    ScheduleRenewal(subscription);
```

## When the reader owns the output format

Awl’s `JsonQueryReport` needs to read query facts to publish its wire representation. This shortened projection shows three fields that a reporter needs together. Awl’s JSON projection (`src/Awl.Reporting/JsonQueryReport.cs`)

```csharp
static object Header(SemanticQueryResult query) =>
    new { query.Kind, query.Truncated, query.IsComplete };
```

Keep formatting in the reporter when the wire contract changes independently. Adding a JSON-rendering method to every domain type spreads that concern through the model.

## When the decision belongs to an agreement between two owners

An offer requires both a qualifying customer and a minimum purchase. An order can own the calculation of its qualifying total, and an offer can own the terms it tests. The checkout then supplies the facts once. Neither type needs access to the other type’s internal collections.

```csharp
// In checkout
bool CanRedeem(Order order, Offer offer) =>
    offer.Accepts(order.CustomerTier, order.QualifyingTotal());

// On Offer
internal bool Accepts(Tier tier, decimal total) =>
    EligibleTiers.Contains(tier) && total >= MinimumSpend;
```

This fits when the offer owns eligibility, and its callers currently read `EligibleTiers` and `MinimumSpend` to repeat that decision. Preserve the original qualifying items, currency and rounding inside `QualifyingTotal`. [Fowler, Tell Don’t Ask](https://martinfowler.com/bliki/TellDontAsk.html)
