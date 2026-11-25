namespace Merkhet.Tests.MagicValues;

public class ApiClient
{
    public string LoadConfig()
    {
        // ruleid: merk.quality.magic-url-csharp
        const string endpoint = "https://api.production.example-corp.com/v1";

        // ruleid: merk.quality.magic-url-csharp
        var partner = "http://partner.acme.io/ingest";

        // ok: merk.quality.magic-url-csharp
        var local = "http://localhost:5000/api";

        // ok: merk.quality.magic-url-csharp
        var schema = "http://schemas.xmlsoap.org/soap/envelope/";

        // ruleid: merk.quality.magic-url-csharp
        return endpoint + partner + local + schema;
    }
}

public class DatabaseConnection
{
    public string BuildConnection()
    {
        // ruleid: merk.quality.magic-connection-string-csharp
        const string prod = "Server=db.prod.example.com;Database=App;UID=app_user;Password=s3cret!;";

        // ruleid: merk.quality.magic-connection-string-csharp
        var legacy = "Data Source=sqlexpress;Initial Catalog=Orders;Integrated Security=true;";

        // ok: merk.quality.magic-connection-string-csharp
        var description = "The connection description includes server details.";

        // ruleid: merk.quality.magic-connection-string-csharp
        return prod + legacy + description;
    }
}
