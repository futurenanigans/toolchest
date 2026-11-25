<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `disjoint-collaborators`

Awl reports substantive groups when each uses at least one injected collaborator type and the groups share none of those types. The evidence pairs members with the collaborators they use. Two fields typed as the same interface count as an overlapping type. Awl rule definition (`docs/class-collaborators.md`)

**Split by use case** when different callers use different method groups. Move each operation with its constructor dependencies. If the cluster instead implements a protocol with a single outcome, give it a service that owns the protocol. [Seemann, On Constructor Over-injection](https://blog.ploeh.dk/2018/08/27/on-constructor-over-injection/) · [Bogard, Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)

**Before**

```csharp
sealed class AccountJobs(IInvoices invoices, IMailer mail, ISessions sessions)
{
    public void SendStatement(AccountId id) => mail.Send(invoices.Statement(id));
    public void SignOut(AccountId id) => sessions.Revoke(id);
}
```

**After**

```csharp
sealed class SendStatement(IInvoices invoices, IMailer mail)
{
    public void Run(AccountId id) => mail.Send(invoices.Statement(id));
}

sealed class SignOut(ISessions sessions)
{
    public void Run(AccountId id) => sessions.Revoke(id);
}
```

The statement path can change its invoice and mail integrations independently of session revocation. A single `Services` object hiding all three behind properties preserves the original dependency set and makes each use harder to see.

## When a framework requires one callback receiver

Suppose an importer registers one `IImportObserver` per run. Its progress callback updates a display and its failure callback records a failed row. Awl can find two substantive groups with disjoint injected types even when the adapter does exactly what the importer requires.

```csharp
sealed class ImportObserver(IProgressDisplay display, IFailedRows failures) : IImportObserver
{
    public void OnProgress(int completed) => display.Show(completed);
    public void OnRowFailed(RowId row, ImportError error) => failures.Record(row, error);
}
```

Keep this small adapter and pass the same observer for the run. The display can change independently of failure recording. Splitting the callbacks into two registrations is only valid if the importer actually supports that lifetime and dispatch contract.
