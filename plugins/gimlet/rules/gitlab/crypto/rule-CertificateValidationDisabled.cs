// License: MIT
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

public class TlsSetup
{
    public void TrustEverything()
    {
        // ruleid: csharp_crypto_rule-CertificateValidationDisabled
        ServicePointManager.ServerCertificateValidationCallback += (sender, cert, chain, errors) => true;
    }

    public void TrustEverythingDelegate()
    {
        // ruleid: csharp_crypto_rule-CertificateValidationDisabled
        ServicePointManager.ServerCertificateValidationCallback += (s, c, ch, e) => true;
    }

    public void TrustOnlyValid()
    {
        // ok: csharp_crypto_rule-CertificateValidationDisabled
        ServicePointManager.ServerCertificateValidationCallback += (sender, cert, chain, errors) => errors == SslPolicyErrors.None;
    }

    public void TrustPinned()
    {
        // ok: csharp_crypto_rule-CertificateValidationDisabled
        ServicePointManager.ServerCertificateValidationCallback += ValidatePinned;
    }

    private static bool ValidatePinned(object sender, X509Certificate cert, X509Chain chain, SslPolicyErrors errors)
    {
        return errors == SslPolicyErrors.None && cert.GetCertHashString() == "AB12CD34";
    }
}
