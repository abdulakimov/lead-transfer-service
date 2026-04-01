import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

// Mock env before importing encryption
const TEST_KEY = randomBytes(32).toString('hex');

vi.mock('../../src/config/env.js', () => ({
  getEnv: () => ({ ENCRYPTION_KEY: TEST_KEY }),
}));

const { encrypt, decrypt } = await import('../../src/config/encryption.js');

describe('encryption', () => {
  it('should encrypt and decrypt a string', () => {
    const plaintext = 'bitrix24_webhook_token_abc123';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'same_token';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('should handle empty strings', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('should handle unicode (Uzbek text)', () => {
    const text = "O'zbekiston Respublikasi";
    const encrypted = encrypt(text);
    expect(decrypt(encrypted)).toBe(text);
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    parts[2] = 'deadbeef'.repeat(4);
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('should throw on invalid format', () => {
    expect(() => decrypt('invalid')).toThrow();
  });
});
