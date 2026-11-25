using System.Diagnostics;
using Humanizer;

namespace Ledger;

// The downstream importer parses export headers with the Humanizer 2.14 wording rules and
// rejects any other build; ExportHeaderTests pins that contract.
public static class ExportHeader
{
    public static string FormatterVersion() =>
        FileVersionInfo.GetVersionInfo(typeof(StringHumanizeExtensions).Assembly.Location).FileVersion ?? "unknown";

    public static string Title(string account) => account.Humanize(LetterCasing.Title);
}
