import { describe, it, expect } from 'vitest';
import { parseLeadFields } from '../../src/services/facebook.js';
import { VALID_LEAD_DATA } from '../fixtures/facebook-webhook.js';

describe('facebook service', () => {
  describe('parseLeadFields', () => {
    it('should parse field_data into flat key-value map', () => {
      const result = parseLeadFields(VALID_LEAD_DATA);
      expect(result).toEqual({
        full_name: 'Abdulloh Karimov',
        phone_number: '+998901234567',
        email: 'abdulloh@example.com',
        city: 'Toshkent',
      });
    });

    it('should handle empty field_data', () => {
      const data = { ...VALID_LEAD_DATA, field_data: [] };
      expect(parseLeadFields(data)).toEqual({});
    });

    it('should handle empty values array', () => {
      const data = {
        ...VALID_LEAD_DATA,
        field_data: [{ name: 'phone', values: [] }],
      };
      expect(parseLeadFields(data)).toEqual({ phone: '' });
    });
  });
});
