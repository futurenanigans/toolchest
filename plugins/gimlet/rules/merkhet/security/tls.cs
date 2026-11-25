using System.Net;
using System.Net.Http;

namespace Merkhet.Tests.Tls;

public class ServicePointExamples
{
    public void TrustEverything()
    {
        // ruleid: merk.security.tls-servicepoint-always-trust-csharp
        ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, errors) => true;

        // ruleid: merk.security.tls-servicepoint-always-trust-csharp
        ServicePointManager.ServerCertificateValidationCallback += (sender, cert, chain, errors) => true;

        // ok: merk.security.tls-servicepoint-always-trust-csharp
        ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, errors) =>
        {
            return errors == System.Net.Security.SslPolicyErrors.None;
        };
    }
}

public class HttpClientHandlerExamples
{
    public HttpClient InsecureViaInitializer()
    {
        // ruleid: merk.security.tls-httpclienthandler-always-trust-csharp
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true,
        };
        return new HttpClient(handler);
    }

    public HttpClient InsecureViaDangerousAcceptAnyInitializer()
    {
        // ruleid: merk.security.tls-httpclienthandler-always-trust-csharp
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
        };
        return new HttpClient(handler);
    }

    public HttpClient InsecureAssignment()
    {
        var h = new HttpClientHandler();
        // ruleid: merk.security.tls-httpclienthandler-always-trust-csharp
        h.ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true;
        return new HttpClient(h);
    }

    public HttpClient SafeDefault()
    {
        // ok: merk.security.tls-httpclienthandler-always-trust-csharp
        var handler = new HttpClientHandler();
        return new HttpClient(handler);
    }
}
