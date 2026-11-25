<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `nullable-state-assertion`

Awl identifies a null-forgiving assertion that changes the compiler’s established flow state. Inspect where the value originates and which behavior the caller owes for missing input. Awl rule definition (`docs/reliability-nullable-assertions.md`)

**Guard and capture the value once.** Represent ordinary absence through a nullable result or a Try-style operation. For a custom Try API, an honest `[NotNullWhen(true)]` contract lets all callers benefit from the compiler’s flow analysis. [Microsoft, Nullable static analysis attributes](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/nullable-analysis)

**Before**

```csharp
int RequiredNameLength(Person person) => person.Name!.Length;
```

**After**

```csharp
int RequiredNameLength(Person person)
{
    string name = person.Name ?? throw new InvalidDataException("A name is required.");
    return name.Length;
}
```

The local remains valid even if the property can change on its next read. Throwing is appropriate here because the input contract requires a name. At a search or optional-display boundary, let the return type carry absence or supply its specified default.

## When a missing name is an ordinary result

An optional badge caption has a different contract from a required name. If code repeatedly checks a lookup and then uses `person.Name!`, make the lookup return the exact value it checked. The annotation tells the compiler what a successful return guarantees.

```csharp
static bool TryGetCaption(Person person, [NotNullWhen(true)] out string? caption)
{
    caption = person.Name;
    return !string.IsNullOrWhiteSpace(caption);
}

if (TryGetCaption(person, out var caption))
    badge.Show(caption);
else
    badge.Hide();
```

Here null, empty and blank names all hide the badge. The implementation establishes the annotation on every successful path, and the caller uses the captured string even if the property changes later. [Microsoft, Conditional nullable postconditions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/attributes/nullable-analysis)
