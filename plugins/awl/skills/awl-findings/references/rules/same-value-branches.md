<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `same-value-branches`

Awl compares the bound operations in the alternative branches, including target overloads and constant values. If all outcomes perform the same operation, establish whether a behavior is missing or whether the decision is unnecessary. Awl rule definition (`docs/reliability-branches.md`)

**Consolidate the common action** when the outcomes are intentionally identical. Evaluate an effectful condition once in its original position if callers depend on its effects or exceptions. For an accidental duplicate, restore the missing outcome and pin both cases with examples. [Fowler, Specification by Example](https://martinfowler.com/bliki/SpecificationByExample.html)

**Before**

```csharp
if (audit.RecordAttempt(request))
    queue.Enqueue(request);
else
    queue.Enqueue(request);
```

**After**

```csharp
audit.RecordAttempt(request);
queue.Enqueue(request);
```

Here the Boolean result only selected identical actions. Recording still precedes queueing and can still fail. If it actually meant authorization to enqueue, the correct repair would retain the branch and give rejection its intended behavior. Treat switch guards and pattern evaluations with the same care.

## When one branch should produce a different result

Suppose the delivery contract promises free collection and a four-unit courier fee. Charging four for both outcomes accidentally overcharges collection.

```csharp
// Before the repair, both arms returned 4m.
decimal Fee(bool collectInStore) => collectInStore ? 0m : 4m;
```

A price check for each delivery method protects both sides of the decision. Returning the common value would keep the error.
