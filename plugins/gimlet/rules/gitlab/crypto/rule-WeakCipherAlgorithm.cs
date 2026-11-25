// License: MIT
using System.Security.Cryptography;

public class LegacyCiphers
{
    public void Encrypt()
    {
        // ruleid: csharp_crypto_rule-WeakCipherAlgorithm
        var des = DES.Create();
        // ruleid: csharp_crypto_rule-WeakCipherAlgorithm
        var desProvider = new DESCryptoServiceProvider();
        // ruleid: csharp_crypto_rule-WeakCipherAlgorithm
        var tdes = TripleDES.Create();
        // ruleid: csharp_crypto_rule-WeakCipherAlgorithm
        var tdesProvider = new TripleDESCryptoServiceProvider();
        // ruleid: csharp_crypto_rule-WeakCipherAlgorithm
        var rc2 = RC2.Create();
        // ruleid: csharp_crypto_rule-WeakCipherAlgorithm
        var rc2Provider = new RC2CryptoServiceProvider();
    }

    public void EncryptModern(byte[] key)
    {
        // ok: csharp_crypto_rule-WeakCipherAlgorithm
        var aes = Aes.Create();
        // ok: csharp_crypto_rule-WeakCipherAlgorithm
        var chacha = new ChaCha20Poly1305(key);
        // ok: csharp_crypto_rule-WeakCipherAlgorithm
        var gcm = new AesGcm(key);
    }
}
