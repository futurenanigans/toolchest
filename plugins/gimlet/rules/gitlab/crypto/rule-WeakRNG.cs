// License: MIT
using System;
using System.Security.Cryptography;

public class TokenFactory
{
    public int ResetCode()
    {
        Random rng = new Random();
        // ruleid: csharp_crypto_rule-WeakRNG
        return rng.Next(100000, 999999);
    }

    public byte[] SessionKey()
    {
        var key = new byte[32];
        var random = new Random();
        // ruleid: csharp_crypto_rule-WeakRNG
        random.NextBytes(key);
        return key;
    }

    public int SecureCode()
    {
        // ok: csharp_crypto_rule-WeakRNG
        return RandomNumberGenerator.GetInt32(100000, 999999);
    }

    public byte[] SecureKey()
    {
        var key = new byte[32];
        // ok: csharp_crypto_rule-WeakRNG
        RandomNumberGenerator.Fill(key);
        return key;
    }
}
