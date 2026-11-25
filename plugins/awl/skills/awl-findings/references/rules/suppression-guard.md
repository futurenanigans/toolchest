<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `suppression-guard`

Awl shows a bound suppression declaration and the diagnostic it names. Check the suppressed diagnostic at its site. A justification string alone cannot establish that the underlying concern was addressed. Awl rule definition (`docs/suppression-policy.md`)

**Repair the invariant at its owner.** Here a warning was silenced because a required request field may be absent. One explicit boundary check gives downstream code the value and its nullability contract. [Microsoft, Nullable static analysis attributes](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/nullable-analysis) · [Microsoft, Suppress code analysis warnings](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/suppress-warnings)

**Before**

```csharp
#pragma warning disable CS8602
int NameLength(Request request) => request.Name.Length;
#pragma warning restore CS8602
```

**After**

```csharp
int NameLength(Request request)
{
    string name = request.Name ?? throw new InvalidDataException("Name is required.");
    return name.Length;
}
```

A project-wide suppression would hide unrelated dereferences in other members.

## Contain a necessary warning in the compatibility adapter

Suppose the supported v1 device accepts only the vendor’s deprecated `SendV1` operation. Moving those calls to the new protocol would break that device. Give the v1 adapter the call and limit the warning directive to that specific operation. [Microsoft, Suppress code analysis warnings](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/suppress-warnings)

```csharp
internal void SendToV1Device(Packet packet)
{
#pragma warning disable CS0618
    vendor.SendV1(packet);
#pragma warning restore CS0618
}
```

Other callers still see the deprecation warning. The support lifetime of the v1 protocol explains when the adapter and suppression can be retired. Awl can continue to report the disable declaration even when the choice is deliberate.
