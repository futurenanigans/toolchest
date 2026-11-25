using Newtonsoft.Json;

namespace Legacy
{
    public class Invoice
    {
        public string Number { get; set; }

        public string ToJson()
        {
            return JsonConvert.SerializeObject(this);
        }
    }
}
