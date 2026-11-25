<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `class-cognitive-complexity`

Awl totals owned functions’ cognitive scores for the class. Look for several methods repeatedly reasoning about the same lifecycle or interpreting the same input. Moving each branch into a helper can make individual functions look small while readers still reconstruct the whole decision. Awl rule definition (`docs/design-metrics.md`)

Separate a **functional core** from the side effects that execute its decision. Give one policy responsibility for the reasons an invoice may be sent. The caller remains responsible for delivery and for what to do with a declined invoice. [Bernhardt, Boundaries](https://www.destroyallsoftware.com/talks/boundaries) · [Fowler, Split Phase](https://refactoring.com/catalog/splitPhase.html)

**Before**

```csharp
void Submit(Invoice invoice)
{
    if (!invoice.IsDraft)
    {
        if (invoice.CustomerApproved) mail.Send(invoice);
        else review.Queue(invoice);
    }
}
```

**After**

```csharp
enum NextStep { Wait, Send, Review }

static class InvoicePolicy
{
    internal static NextStep Decide(Invoice invoice)
    {
        if (invoice.IsDraft) return NextStep.Wait;
        return invoice.CustomerApproved ? NextStep.Send : NextStep.Review;
    }
}

// On the submission workflow
void Submit(Invoice invoice)
{
    switch (InvoicePolicy.Decide(invoice))
    {
        case NextStep.Send: mail.Send(invoice); break;
        case NextStep.Review: review.Queue(invoice); break;
    }
}
```

`InvoicePolicy.Decide` can be exercised for each input combination without delivery infrastructure. Waiting has no side effect. This pays off when several entry points apply the policy or the policy is substantial. For a single short method, a guard clause can be easier to read.

## When several methods reconstruct the same lifecycle

Suppose `Submit` and `Approve` each inspect `isSubmitted` and `isApproved`. The supported sequence is draft, submitted, approved, and an invalid transition already throws. Store one state and place the legal transitions together. [Fowler, State Machine](https://martinfowler.com/dslCatalog/stateMachine.html)

```csharp
enum Stage { Draft, Submitted, Approved }
enum Command { Submit, Approve }

sealed class Application
{
    private Stage stage = Stage.Draft;

    public void Apply(Command command) => stage = (stage, command) switch
    {
        (Stage.Draft, Command.Submit) => Stage.Submitted,
        (Stage.Submitted, Command.Approve) => Stage.Approved,
        _ => throw new InvalidOperationException("Invalid transition.")
    };
}
```

A caller reading the table can tell whether approval before submission or a repeated submission is valid. If an existing command is idempotent, give its repeated invocation an explicit transition back to the same state. One state field also rules out combinations such as “approved but never submitted.”
