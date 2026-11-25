using Newtonsoft.Json;

namespace Ledger;

public static class EntrySerializer
{
    public static string Serialize(Entry entry) => JsonConvert.SerializeObject(entry);

    public static Entry? Deserialize(string json) => JsonConvert.DeserializeObject<Entry>(json);
}
