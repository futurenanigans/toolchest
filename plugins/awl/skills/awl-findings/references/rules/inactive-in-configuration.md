<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `inactive-in-configuration`

Awl found a condition on every established production route to a group and a captured effective configuration that makes the condition false. Inspect the environment, key and value. A different deployment can legitimately select this capability. Awl rule definition (`docs/conditional-reachability.md`)

**Retire completed toggles** when the feature owner has decided the old branch is gone everywhere. If both modes remain supported, keep a single selection point with explicit option values, and correct a mistaken deployment setting at its source. [Hodgson, Feature Toggles](https://martinfowler.com/articles/feature-toggles.html)

**Before**

```csharp
void Export(Report report)
{
    if (configuration.GetValue<bool>("Export:UseLegacyFormat"))
        WriteLegacy(report);
    else
        WriteCurrent(report);
}
```

**After**

```csharp
// After the legacy format has been retired for every supported consumer
void Export(Report report) => WriteCurrent(report);
```

The second version is appropriate only after checking supported environments, external consumers and the retirement decision. Retire the old configuration key with its implementation.

## Follow the winning provider when an active deployment is disabled

A publishing job may be required in production and intentionally disabled in staging. Here `Finish` is the only production entry to the private publishing operation.

```csharp
public void Finish(Report report)
{
    archive.Store(report);
    if (configuration.GetValue<bool>("Reports:Publish"))
        PublishArchive(report);
}

private void PublishArchive(Report report) => publisher.Publish(report);
```

Suppose the production capture lists JSON `Reports:Publish=true` followed by an environment provider with `Reports__Publish=false`. The environment value wins. If production must publish, correct or remove that override and keep both code paths. If the same effective value belongs to staging and is deliberate, retaining the conditional is correct there. An `IOptions<T>` property can be a selector for route analysis, but the inactivity finding needs a supported read whose key maps to a captured value. [Microsoft, Configuration providers](https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration-providers) · Awl’s supported configuration reads (`docs/conditional-reachability.md#route-conditions`)
