<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `wide-fan-in`

Awl counts distinct source declarations that depend on a target. Twenty reads in one member count once. A dependency can also be a parameter type, field type or construction. The default warning starts above 20 consumers. For a production target, Awl lists Test-role consumers separately. Awl rule definition (`docs/source-fan-in.md`)

Start with the named consumers and ask what change would force them to edit together. A report preview needs to read a report. A retention job needs to delete one. If both take the concrete store, both depend on its public shape. **Role interfaces** give each caller the operation it needs. The storage adapter can implement both, and startup can supply the same instance to both callers. [Fowler, Role Interface](https://martinfowler.com/bliki/RoleInterface.html) · [Cockburn, Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture)

**Before**

```csharp
sealed class Preview(ReportStore store)
{
    public Report Show(ReportId id) => store.Load(id);
}

sealed class Retention(ReportStore store)
{
    public void Expire(ReportId id) => store.Delete(id);
}
```

**After**

```csharp
interface IReportReader { Report Load(ReportId id); }
interface IReportRetention { void Delete(ReportId id); }

sealed class ReportStore(ReportDb db) : IReportReader, IReportRetention
{
    public Report Load(ReportId id) => db.Load(id);
    public void Delete(ReportId id) => db.Delete(id);
}

sealed class Preview(IReportReader reports)
{
    public Report Show(ReportId id) => reports.Load(id);
}

sealed class Retention(IReportRetention reports)
{
    public void Expire(ReportId id) => reports.Delete(id);
}
```

A change to deletion can now leave the preview contract alone. An interface that copies the whole store API would transfer the fan-in while leaving every consumer exposed to the same changes.

## When the target is a constructor

Look at what the callers repeatedly have to know. Every Awl assessment must agree with its rule descriptor on the rule ID and definition version. A **named creation method** can express that policy once. Compare these two ways of creating the same assessment. [Fowler, Replace Constructor with Factory Function](https://refactoring.com/catalog/replaceConstructorWithFactoryFunction.html)

```csharp
// A direct constructor call supplies identity and observation.
return new Assessment(Descriptor.Id, Descriptor.DefinitionVersion,
    subject, message, value, locations, contexts, evidence);
```

```csharp
// The rule supplies its observation. Finding supplies the descriptor identity.
return Finding(subject, message, value, locations, contexts, evidence);
```

`Finding` can itself have wide fan-in. That is useful here. If the identity policy changes, its implementation has a single owner. Awl’s rule base (`src/Awl.Rules/Metadata/DescribedRule.cs`) · Use in the fan-in rule (`src/Awl.Rules/Design/WideFanInRule.cs`)

## When to keep the shared type

Awl’s semantic captures take the same `FileScope` because they need the same bound file and project context. Its cost queries and rules share `SizeFactor` because a factor’s identity, basis and power must agree across a call path. Many consumers of either type are expected. Likewise, splitting `AnalysisResult` between a serializer and a reporter would give them two representations to keep in agreement. Keep shared types while their consumers genuinely need the same meaning. FileScope (`src/Awl.Semantics/Extracts/ExtractFamily.cs`) · SizeFactor (`src/Awl.Contracts/Performance/CostEvidence.cs`) · AnalysisResult (`src/Awl.Contracts/Analysis.cs`)
