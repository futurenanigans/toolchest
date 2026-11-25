<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `weighted-methods-per-class`

Awl sums the cyclomatic weights of owned function bodies, including local functions, across partial declarations. A method with a body contributes a base weight even when it has no decisions. Extracting ten private methods on the same class can increase this measure. Awl rule definition (`docs/class-metrics.md`)

**Split Phase** when different sets of decisions need different inputs. Here parsing owns text and diagnostics, quoting owns prices and tariff rules. Pass a meaningful parsed value through the boundary. Keep policy cases that change together local to their phase. [Fowler, Split Phase](https://refactoring.com/catalog/splitPhase.html)

**Before**

```csharp
Quote ReadQuote(string line)
{
    var fields = line.Split(',');
    int units = int.Parse(fields[1], CultureInfo.InvariantCulture);
    if (units < 1) throw new FormatException("Units must be positive.");
    return fields[0] == "rush" ? RushPrice(units) : RegularPrice(units);
}
```

**After**

```csharp
static OrderLine ParseLine(string line)
{
    var fields = line.Split(',');
    int units = int.Parse(fields[1], CultureInfo.InvariantCulture);
    if (units < 1) throw new FormatException("Units must be positive.");
    return new OrderLine(fields[0], units);
}

// On the tariff policy
internal Quote Price(OrderLine line) =>
    line.Service == "rush" ? RushPrice(line.Units) : RegularPrice(line.Units);
```

The caller composes `tariff.Price(ParseLine(text))`. A malformed quantity still fails before pricing. If the high weight comes from a cohesive, exhaustive protocol definition, keep its cases discoverable together. Splitting a class across partial files leaves Awl’s subject intact.

## When several methods repeat the same classification

A carrier sells each service as a pair of terms. Suppose `FeeFor` and `DaysFor` both branch on `"express"` and `"standard"` and reject every other code. Put the pair in one decision table so adding a service requires one complete row.

```csharp
readonly record struct DeliveryTerms(decimal Fee, int TransitDays);

static DeliveryTerms TermsFor(string service) => service switch
{
    "express" => new(12m, 1),
    "standard" => new(4m, 3),
    _ => throw new ArgumentException("Unknown service.", nameof(service))
};

decimal FeeFor(string service) => TermsFor(service).Fee;
int DaysFor(string service) => TermsFor(service).TransitDays;
```

The existing entry points can keep their signatures and unknown-code failure. Group the values only while they share the carrier’s service contract. If prices change by currency and transit times change by route, independent tables have different owners.
