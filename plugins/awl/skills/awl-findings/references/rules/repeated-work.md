<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `repeated-work`

Awl found a supported sort, parse or materialization inside a loop whose inputs appear unchanged. Compare the witnesses for the loop, operation and inputs. Check aliases, callbacks and captured state before moving the evaluation. Awl rule definition (`docs/performance-families.md`)

## Is this a false positive?

Follow the input through the call site. Parsing the same batch configuration for every item repeats invariant work. Parsing `item.Payload` reads that item’s input, even if several payloads happen to contain equal text. If a helper or an alias hides this distinction, check whether each call really sees the same value. Hoisting an item-specific parse would apply the first item’s data to the rest. Awl’s input-invariance criteria (`docs/performance-costs.md#source-summaries`)

## Compute a batch-wide value once

**Hoist loop-invariant work** into a local value with the same useful lifetime. Here the immutable JSON string describes one set of rules for the whole batch. Parse it once and dispose the document after the last consumer. [Microsoft, JsonDocument.Parse](https://learn.microsoft.com/en-us/dotnet/api/system.text.json.jsondocument.parse?view=net-10.0)

**Before**

```csharp
foreach (var item in items)
{
    using var rules = JsonDocument.Parse(rulesJson);
    Apply(item, rules.RootElement);
}
```

**After**

```csharp
if (items.Count == 0) return;
using var rules = JsonDocument.Parse(rulesJson);
foreach (var item in items)
    Apply(item, rules.RootElement);
```

The empty-list guard preserves the earlier behavior for an empty batch and malformed JSON. This example assumes `Apply` consumes the element synchronously and does not retain it. A per-batch local also avoids cross-request cache keys, staleness and eviction.

## Initialize on the first item that needs the value

A validator may receive a nonempty batch containing only free-text fields. Previously it constructed `new Regex(codeFormat)` inside the code-field branch. Moving the constructor to method entry would make a malformed format fail a batch that never uses it. Keep the construction inside that branch and reuse a successful result.

```csharp
Regex? codePattern = null;
foreach (var field in fields)
{
    if (field.Kind != FieldKind.Code) continue;
    codePattern ??= new Regex(codeFormat);
    ValidateCode(field, codePattern);
}
```

Here `codeFormat` is fixed for the batch. An invalid expression still fails on the first code field, and earlier fields keep their original processing order. With a format that varies per field, a single cached expression would apply the wrong rule. [Microsoft, Regex construction and reuse](https://learn.microsoft.com/en-us/dotnet/fundamentals/runtime-libraries/system-text-regularexpressions-regex)
