using System;
using System.Security.Cryptography;

namespace Gimlet.Tests.Crypto;

public class HashExamples
{
    public byte[] Fingerprint(byte[] data)
    {
        // ruleid: gimlet.security.weak-hash-csharp
        using var md5 = MD5.Create();

        // ruleid: gimlet.security.weak-hash-csharp
        using var sha1 = SHA1.Create();

        // ruleid: gimlet.security.weak-hash-csharp
        using var provider = new MD5CryptoServiceProvider();

        // ruleid: gimlet.security.weak-hash-csharp
        using var sha1Provider = new SHA1CryptoServiceProvider();

        // ruleid: gimlet.security.weak-hash-csharp
        using var byName = HashAlgorithm.Create("MD5");

        // ok: gimlet.security.weak-hash-csharp
        using var sha256 = SHA256.Create();

        return md5!.ComputeHash(data);
    }
}

public class CipherExamples
{
    public void WeakCiphers()
    {
        // ruleid: gimlet.security.weak-cipher-csharp
        using var des = DES.Create();

        // ruleid: gimlet.security.weak-cipher-csharp
        using var tdes = TripleDES.Create();

        // ruleid: gimlet.security.weak-cipher-csharp
        using var rc2 = RC2.Create();

        // ruleid: gimlet.security.weak-cipher-csharp
        using var desProvider = new DESCryptoServiceProvider();

        // ok: gimlet.security.weak-cipher-csharp
        using var aes = Aes.Create();
    }

    public void EcbModeUsage()
    {
        var aes = Aes.Create();

        // ruleid: gimlet.security.ecb-mode-csharp
        aes.Mode = CipherMode.ECB;

        byte[] data = new byte[16];
        byte[] key = new byte[32];

        // ruleid: gimlet.security.ecb-mode-csharp
        aes.EncryptEcb(data, PaddingMode.PKCS7);

        // ok: gimlet.security.ecb-mode-csharp
        aes.Mode = CipherMode.CBC;
    }
}

public class RandomExamples
{
    public string SessionToken()
    {
        // ruleid: gimlet.security.insecure-randomness-csharp
        var weak = new Random();

        // ruleid: gimlet.security.insecure-randomness-csharp
        var seeded = new Random(42);

        // ok: gimlet.security.insecure-randomness-csharp
        var secure = RandomNumberGenerator.Create();

        var bytes = new byte[16];
        secure.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }
}
