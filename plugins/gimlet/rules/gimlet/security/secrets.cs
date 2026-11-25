namespace Gimlet.Tests.Secrets;

public class HardcodedCredentials
{
    // ruleid: gimlet.security.hardcoded-credential-assignment-csharp
    private const string ApiKey = "sk-abc123xyz456"; // gitleaks:allow

    // ruleid: gimlet.security.hardcoded-credential-assignment-csharp
    private static readonly string Password = "hunter2";

    // ruleid: gimlet.security.hardcoded-credential-assignment-csharp
    public const string AccessToken = "ghp_abc123xyz456"; // gitleaks:allow

    // ok: gimlet.security.hardcoded-credential-assignment-csharp
    private const string ApiKey = "";

    // ok: gimlet.security.hardcoded-credential-assignment-csharp
    private const string BaseUrl = "https://api.example.com";

    // ok: gimlet.security.hardcoded-credential-assignment-csharp
    private const int Timeout = 30;

    public void SetupConnections()
    {
        // ruleid: gimlet.security.connection-string-with-password
        string conn1 = "Server=db.example.com;Database=prod;User Id=sa;Password=hunter2;";

        // ruleid: gimlet.security.connection-string-with-password
        string conn2 = @"Data Source=db.example.com;Initial Catalog=prod;uid=sa;pwd=hunter2;";

        // ok: gimlet.security.connection-string-with-password
        string conn3 = "Server=db.example.com;Database=prod;Integrated Security=true;";

        // ok: gimlet.security.connection-string-with-password
        string conn4 = "Server=db.example.com;Database=prod;User Id=sa;Password=${DB_PASSWORD};";
    }
}
