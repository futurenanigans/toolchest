using System;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

public class Encryptor
{
    private readonly IConfiguration _config;

    public Encryptor(IConfiguration config) => _config = config;

    public Aes HardcodedAes()
    {
        var aes = Aes.Create();
        // ruleid: gimlet.security.crypto-key-literal-csharp
        aes.Key = Encoding.UTF8.GetBytes("0123456789abcdef0123456789abcdef");
        // ruleid: gimlet.security.crypto-static-iv-csharp
        aes.IV = new byte[16];
        return aes;
    }

    public Aes HardcodedBytes()
    {
        var aes = Aes.Create();
        // ruleid: gimlet.security.crypto-key-literal-csharp
        aes.Key = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
        // ruleid: gimlet.security.crypto-static-iv-csharp
        aes.IV = new byte[] { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
        return aes;
    }

    public Aes StringIv(byte[] key)
    {
        var aes = Aes.Create();
        // ok: gimlet.security.crypto-key-literal-csharp
        aes.Key = key;
        // ruleid: gimlet.security.crypto-static-iv-csharp
        aes.IV = Encoding.ASCII.GetBytes("fixedinitvector!");
        return aes;
    }

    public AesGcm HardcodedGcm()
    {
        // ruleid: gimlet.security.crypto-key-literal-csharp
        return new AesGcm(new byte[] { 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8, 7, 6, 5, 4 }, 16);
    }

    public byte[] SignWebhook(byte[] payload)
    {
        // ruleid: gimlet.security.crypto-key-literal-csharp
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes("webhook-signing-secret"));
        return hmac.ComputeHash(payload);
    }

    public Aes RandomAes()
    {
        var aes = Aes.Create();
        // ok: gimlet.security.crypto-key-literal-csharp
        aes.Key = RandomNumberGenerator.GetBytes(32);
        // ok: gimlet.security.crypto-static-iv-csharp
        aes.GenerateIV();
        return aes;
    }

    public Aes RandomIv(byte[] key)
    {
        var aes = Aes.Create();
        aes.Key = key;
        // ok: gimlet.security.crypto-static-iv-csharp
        aes.IV = RandomNumberGenerator.GetBytes(16);
        return aes;
    }

    public Aes ReadIv(byte[] key, byte[] header)
    {
        var aes = Aes.Create();
        aes.Key = key;
        // ok: gimlet.security.crypto-static-iv-csharp
        aes.IV = header[..16];
        return aes;
    }

    public byte[] SignFromConfig(byte[] payload)
    {
        // ok: gimlet.security.crypto-key-literal-csharp
        using var hmac = new HMACSHA256(Convert.FromBase64String(_config["Webhook:SigningKey"]));
        return hmac.ComputeHash(payload);
    }

    public AesGcm GcmFromRandom()
    {
        // ok: gimlet.security.crypto-key-literal-csharp
        return new AesGcm(RandomNumberGenerator.GetBytes(32), 16);
    }
}
