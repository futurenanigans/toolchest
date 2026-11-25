using FluentAssertions;
using Ledger;
using Xunit;

namespace Ledger.Tests;

public class EntrySerializerTests
{
    [Fact]
    public void Round_trips_an_entry()
    {
        var entry = new Entry("cash", 12.50m);

        var copy = EntrySerializer.Deserialize(EntrySerializer.Serialize(entry));

        copy.Should().Be(entry);
    }
}
