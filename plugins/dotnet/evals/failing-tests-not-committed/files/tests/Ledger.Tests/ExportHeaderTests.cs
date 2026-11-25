using Ledger;
using Xunit;

namespace Ledger.Tests;

public class ExportHeaderTests
{
    [Fact]
    public void Header_names_the_formatter_build_the_importer_accepts()
    {
        Assert.StartsWith("2.14.", ExportHeader.FormatterVersion());
    }

    [Fact]
    public void Title_humanizes_the_account_name()
    {
        Assert.Equal("Petty Cash", ExportHeader.Title("petty_cash"));
    }
}
