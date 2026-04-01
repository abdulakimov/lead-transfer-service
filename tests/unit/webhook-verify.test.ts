import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { computeHmac } from '../../src/middleware/webhook-verify.js';

describe('webhook-verify', () => {
  describe('computeHmac', () => {
    it('should compute correct HMAC-SHA256 signature', () => {
      const secret = 'test_secret';
      const payload = '{"test":"data"}';

      const expected = 'sha256=' + createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      expect(computeHmac(secret, payload)).toBe(expected);
    });

    it('should produce different signatures for different payloads', () => {
      const secret = 'test_secret';
      const sig1 = computeHmac(secret, 'payload1');
      const sig2 = computeHmac(secret, 'payload2');
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const payload = 'same_payload';
      const sig1 = computeHmac('secret1', payload);
      const sig2 = computeHmac('secret2', payload);
      expect(sig1).not.toBe(sig2);
    });

    it('should handle Buffer payloads', () => {
      const secret = 'test_secret';
      const payload = Buffer.from('{"test":"data"}');
      const result = computeHmac(secret, payload);
      expect(result).toMatch(/^sha256=[a-f0-9]{64}$/);
    });
  });
});
