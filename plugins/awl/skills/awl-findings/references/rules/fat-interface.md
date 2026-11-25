<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `fat-interface`

Awl groups the members of a source interface by the types that use them. Overloads count as one member, and two members share a group when one consumer type uses both. A finding means there are two or more groups, so no consumer needs the whole interface. The evidence lists each member group with its consumers. Test projects do not count as consumers, and consumers outside the loaded solution are not seen. Awl rule definition (`docs/pattern-pressures.md`)

**Split the interface** along the listed groups and let each consumer take the part it uses. One class can still implement every part. [Martin, The Interface Segregation Principle](https://web.archive.org/web/20150905081110/http://www.objectmentor.com/resources/articles/isp.pdf) · [Fowler, Role Interface](https://martinfowler.com/bliki/RoleInterface.html)

**Before**

```csharp
public interface IAccounts
{
    Account Find(AccountId id);
    IReadOnlyList<Account> Overdue(DateOnly on);
    void Save(Account account);
    void Close(AccountId id);
}

sealed class OverdueReport(IAccounts accounts) { /* uses Find and Overdue */ }
sealed class CloseAccount(IAccounts accounts) { /* uses Save and Close */ }
```

**After**

```csharp
public interface IAccountQueries
{
    Account Find(AccountId id);
    IReadOnlyList<Account> Overdue(DateOnly on);
}

public interface IAccountChanges
{
    void Save(Account account);
    void Close(AccountId id);
}

sealed class SqlAccounts : IAccountQueries, IAccountChanges { /* ... */ }

sealed class OverdueReport(IAccountQueries accounts) { /* ... */ }
sealed class CloseAccount(IAccountChanges accounts) { /* ... */ }
```

A fake for the report implements two methods, and a change to `Close` cannot affect it.

## When the interface is a published contract

A plug-in interface that other solutions implement is a different case. Inside this solution one host type may call `Start` and another may call `Stop`, which gives two groups, while every implementer must still supply both to take part in the lifecycle. Splitting it would break those implementers and let a plug-in start without being stoppable.

```csharp
public interface IPlugin
{
    void Start(PluginContext context);
    void Stop();
}
```

Keep the interface. If only this solution consumes the assembly, name it in `analysis.closedAssemblies` so the finding no longer carries the unseen-consumer note.
