import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/utils/encryption.js';

describe('AES-256-GCM Encryption Utility', () => {
  it('encrypts and decrypts text round-trip', () => {
    const secret = 'super-sensitive-oauth-token-12345';
    const encrypted = encrypt(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.split('.').length).toBe(3); // iv.tag.ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('produces different ciphertext for same plaintext due to random IV', () => {
    const text = 'same-token';
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(text);
    expect(decrypt(enc2)).toBe(text);
  });

  it('fails decryption on tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const [iv, tag, cipher] = encrypted.split('.');
    const tampered = `${iv}.${tag}.${cipher}ff`;
    expect(() => decrypt(tampered)).toThrow();
  });
});

