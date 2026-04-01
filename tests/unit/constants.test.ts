import { describe, it, expect } from 'vitest';
import { LEAD_STATUS, RETRY_DELAYS, MAX_ATTEMPTS, CRM_TYPE } from '../../src/config/constants.js';

describe('constants', () => {
  it('should have correct lead statuses', () => {
    expect(LEAD_STATUS.PENDING).toBe('pending');
    expect(LEAD_STATUS.PROCESSING).toBe('processing');
    expect(LEAD_STATUS.DELIVERED).toBe('delivered');
    expect(LEAD_STATUS.FAILED).toBe('failed');
    expect(LEAD_STATUS.DLQ).toBe('dlq');
  });

  it('should have increasing retry delays', () => {
    for (let i = 1; i < RETRY_DELAYS.length; i++) {
      expect(RETRY_DELAYS[i]).toBeGreaterThan(RETRY_DELAYS[i - 1]);
    }
  });

  it('should have MAX_ATTEMPTS = retry delays + 1', () => {
    expect(MAX_ATTEMPTS).toBe(RETRY_DELAYS.length + 1);
  });

  it('should have bitrix24 CRM type', () => {
    expect(CRM_TYPE.BITRIX24).toBe('bitrix24');
  });
});
