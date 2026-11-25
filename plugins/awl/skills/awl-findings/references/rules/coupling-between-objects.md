<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `coupling-between-objects`

Awl counts distinct named types whose full assembly identities belong to the loaded compilation catalog. The evidence also lists external types separately. Read the internal target names and the members that use them. A query that captures, attributes and publishes evidence may touch many types for one coherent reason. A class can also hide several decisions that genuinely change independently. Awl rule definition (`docs/class-metrics.md#bound-class-coupling`)

## Separate file matching from declaration attribution

Awl’s coverage analysis illustrates two different decisions. Matching decides whether an input report describes the file and contents currently loaded. Attribution decides which declaration owns a measured line and how its hits contribute to that declaration’s totals. If the file matcher also implements this second decision, it must understand the file index, coverage lines, member map and observation records. [Fowler, Move Function](https://refactoring.com/catalog/moveFunction.html)

**Before**

```csharp
// Inside a file matcher, after validating the reports and merging their lines.
foreach (var document in linked)
{
    var byMember = new Dictionary<int, List<CoverageLine>>();
    foreach (var line in lines)
    {
        int member = document.Value.Lines[line.Number - 1];
        if (member < 0) continue;
        if (!byMember.TryGetValue(member, out var owned))
        {
            owned = [];
            byMember.Add(member, owned);
        }
        owned.Add(line);
    }
    AppendDeclarationTotals(document, byMember, declarations);
}
```

**After**

```csharp
foreach (var document in linked)
    declarations.AddRange(CoverageAttribution.Attribute(document, lines));
```

The attribution operation owns the grouping **and** the aggregation of hits and branches. The caller still owns matching, stale inputs and the choice of linked documents. A change to branch totals has one home. The same document paired with the same measured lines should produce the same declaration observations. Awl’s file matching (`src/Awl.Semantics/Observations/CoverageDocuments.cs`) · Awl’s line attribution (`src/Awl.Semantics/Observations/CoverageAttribution.cs`)

## Keep a cohesive evidence projection

Awl’s `SourceCosts` publishes the costs for one semantic view. Functions, declarations, gaps, paths and omissions travel together because they explain the same result.

```csharp
return new CostEvidence(view.Identity, DefinitionVersion, LibraryCostContracts.Version,
    fold.Functions, fold.Declared, fold.Gaps)
{
    Paths = fold.Paths,
    Omissions = fold.Omissions
};
```

Keeping that construction in one place lets a reader check that the measurements carry their provenance and completeness information. One wrapper per result field would spread that check across several types. Keep the projection together while those types serve the same contract. Reconsider the boundary if it starts deciding which costs should deny a hook edit, a policy with a different owner. Awl’s cost evidence query (`src/Awl.Semantics/Performance/SourceCosts.cs`) · Awl’s disposition policy (`docs/rule-execution.md#policy-identity`)
