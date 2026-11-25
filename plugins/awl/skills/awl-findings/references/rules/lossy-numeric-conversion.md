<!-- Generated from guides/patterns/ by dev/sync-plugin-guides.ps1. -->

# Common patterns to address findings of `lossy-numeric-conversion`

Awl inspects built-in numeric conversions, including implicit ones. Evidence can identify an actual changed constant or a value the source type could represent that the target cannot. Decide whether the operation promises an exact value, a bounded range or deliberate rounding. Awl rule definition (`docs/reliability-numeric-conversions.md`)

**Convert at the boundary** that requires a narrower representation. Keep the full type internally. For integral narrowing use checked conversion if overflow must fail. For decimal-to-integral conversion specify fractional handling separately. [Microsoft, Built-in numeric conversions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/numeric-conversions) · [Microsoft, Checked and unchecked arithmetic](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/checked-and-unchecked)

**Before**

```csharp
int ExportWholeUnits(decimal quantity) => (int)quantity;
```

**After**

```csharp
int ExportWholeUnits(decimal quantity)
{
    if (quantity != decimal.Truncate(quantity))
        throw new ArgumentException("Whole units are required.", nameof(quantity));

    return decimal.ToInt32(quantity);
}
```

The example adopts a whole-unit export contract. Decimal.ToInt32 rejects an out-of-range value and the guard rejects a fractional one. A checked cast alone still truncates fractions. If rounding is the business rule, state its scale and midpoint policy where the conversion takes place.

## When rounding is the published rule

If charges are rounded to a whole unit and half units round away from zero, accepting fractions is intentional. Specify the midpoint behavior before narrowing.

```csharp
static int BilledUnits(decimal units) =>
    decimal.ToInt32(decimal.Round(units, 0, MidpointRounding.AwayFromZero));
```

A quantity of `2.5m` becomes `3`. A credit of `-2.5m` becomes `-3`. The conversion still rejects a rounded result outside the integer range. [Microsoft, Decimal.Round](https://learn.microsoft.com/en-us/dotnet/api/system.decimal.round?view=net-10.0)

## When the value is an identifier

Two distinct 64-bit identifiers can become the same binary floating-point number even through an implicit conversion. If the wire protocol accepts decimal text, format the original integer directly.

```csharp
long id = 9_007_199_254_740_993L;
double numericKey = id;  // becomes 9_007_199_254_740_992
string textKey = id.ToString(CultureInfo.InvariantCulture);  // retains every digit
```

Keep `long` keys in memory when they already meet the contract. Both endpoints must agree on a text representation before changing a numeric wire field. [Microsoft, Built-in numeric conversions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/numeric-conversions)
