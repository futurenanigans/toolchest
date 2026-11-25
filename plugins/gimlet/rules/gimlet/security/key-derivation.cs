using System;
using System.Security.Cryptography;

public class PasswordHashing
{
    private readonly int _iterations;

    public PasswordHashing(int iterations) => _iterations = iterations;

    public byte[] LegacyHash(string password, byte[] salt)
    {
        // ruleid: gimlet.security.pbkdf2-default-iterations-csharp
        using var kdf = new Rfc2898DeriveBytes(password, salt);
        return kdf.GetBytes(32);
    }

    public byte[] LegacyHashWithCount(string password, byte[] salt)
    {
        // ruleid: gimlet.security.pbkdf2-default-iterations-csharp
        using var kdf = new Rfc2898DeriveBytes(password, salt, 100000);
        return kdf.GetBytes(32);
    }

    public byte[] LegacyHashBytes(byte[] password, byte[] salt)
    {
        // ruleid: gimlet.security.pbkdf2-default-iterations-csharp
        var kdf = new Rfc2898DeriveBytes(password, salt);
        return kdf.GetBytes(32);
    }

    public byte[] ModernHash(string password, byte[] salt)
    {
        // ok: gimlet.security.pbkdf2-default-iterations-csharp
        using var kdf = new Rfc2898DeriveBytes(password, salt, 600000, HashAlgorithmName.SHA256);
        return kdf.GetBytes(32);
    }

    public byte[] ModernHashSha512(string password, byte[] salt)
    {
        // ok: gimlet.security.pbkdf2-default-iterations-csharp
        using var kdf = new Rfc2898DeriveBytes(password, salt, 210000, HashAlgorithmName.SHA512);
        return kdf.GetBytes(64);
    }

    public byte[] StaticHash(string password, byte[] salt)
    {
        // ok: gimlet.security.pbkdf2-default-iterations-csharp
        return Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32);
    }

    public byte[] WeakSha256(string password, byte[] salt)
    {
        // ruleid: gimlet.security.pbkdf2-low-iterations-csharp
        return Rfc2898DeriveBytes.Pbkdf2(password, salt, 10000, HashAlgorithmName.SHA256, 32);
    }

    public byte[] WeakSha512(string password, byte[] salt)
    {
        // ruleid: gimlet.security.pbkdf2-low-iterations-csharp
        using var kdf = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA512);
        return kdf.GetBytes(64);
    }

    public byte[] WeakCtorSha256(string password, byte[] salt)
    {
        // ruleid: gimlet.security.pbkdf2-low-iterations-csharp
        using var kdf = new Rfc2898DeriveBytes(password, salt, 310000, HashAlgorithmName.SHA256);
        return kdf.GetBytes(32);
    }

    public void WeakSpan(string password, byte[] salt, byte[] dest)
    {
        // ruleid: gimlet.security.pbkdf2-low-iterations-csharp
        Rfc2898DeriveBytes.Pbkdf2(password, salt, dest, 1000, HashAlgorithmName.SHA256);
    }

    public byte[] StrongSha256(string password, byte[] salt)
    {
        // ok: gimlet.security.pbkdf2-low-iterations-csharp
        return Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32);
    }

    public byte[] StrongSha512(string password, byte[] salt)
    {
        // ok: gimlet.security.pbkdf2-low-iterations-csharp
        return Rfc2898DeriveBytes.Pbkdf2(password, salt, 210000, HashAlgorithmName.SHA512, 64);
    }

    public byte[] ConfiguredCount(string password, byte[] salt)
    {
        // ok: gimlet.security.pbkdf2-low-iterations-csharp
        return Rfc2898DeriveBytes.Pbkdf2(password, salt, _iterations, HashAlgorithmName.SHA256, 32);
    }
}
