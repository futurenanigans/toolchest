using System.Net;
using System.Net.Http;

namespace Gimlet.Tests.Tls;

public class ServicePointExamples
{
    public void TrustEverything()
    {
        // ruleid: gimlet.security.tls-servicepoint-always-trust-csharp
        ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, errors) => true;

        // ruleid: gimlet.security.tls-servicepoint-always-trust-csharp
        ServicePointManager.ServerCertificateValidationCallback += (sender, cert, chain, errors) => true;

        // ok: gimlet.security.tls-servicepoint-always-trust-csharp
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
        // ruleid: gimlet.security.tls-httpclienthandler-always-trust-csharp
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true,
        };
        return new HttpClient(handler);
    }

    public HttpClient InsecureViaDangerousAcceptAnyInitializer()
    {
        // ruleid: gimlet.security.tls-httpclienthandler-always-trust-csharp
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
        };
        return new HttpClient(handler);
    }

    public HttpClient InsecureAssignment()
    {
        var h = new HttpClientHandler();
        // ruleid: gimlet.security.tls-httpclienthandler-always-trust-csharp
        h.ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true;
        return new HttpClient(h);
    }

    public HttpClient SafeDefault()
    {
        // ok: gimlet.security.tls-httpclienthandler-always-trust-csharp
        var handler = new HttpClientHandler();
        return new HttpClient(handler);
    }
}
