// License: MIT
using System.Security.Cryptography;
using System.Text;

public class Fingerprints
{
    public byte[] Legacy(string input)
    {
        var data = Encoding.UTF8.GetBytes(input);
        // ruleid: csharp_crypto_rule-WeakHashingFunction
        var md5 = new MD5CryptoServiceProvider();
        // ruleid: csharp_crypto_rule-WeakHashingFunction
        var sha1 = new SHA1CryptoServiceProvider();
        // ruleid: csharp_crypto_rule-WeakHashingFunction
        System.Security.Cryptography.MD5.Create();
        // ruleid: csharp_crypto_rule-WeakHashingFunction
        System.Security.Cryptography.SHA1.Create();
        return md5.ComputeHash(data);
    }

    public byte[] Modern(string input)
    {
        var data = Encoding.UTF8.GetBytes(input);
        // ok: csharp_crypto_rule-WeakHashingFunction
        var sha256 = new SHA256CryptoServiceProvider();
        // ok: csharp_crypto_rule-WeakHashingFunction
        System.Security.Cryptography.SHA512.Create();
        // ok: csharp_crypto_rule-WeakHashingFunction
        return SHA256.HashData(data);
    }
}
