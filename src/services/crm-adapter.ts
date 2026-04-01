import type { NormalizedLead } from './facebook.js';

// ── Result returned by every CRM adapter after delivering a lead ──

export interface CrmDeliveryResult {
  success: true;
  crmLeadId: string | number;
  crmType: string;
}

// ── All CRM integrations must implement this interface ──

export interface CrmAdapter {
  /**
   * Deliver a lead to the CRM.
   * Throws on failure (retryable errors should use standard Error;
   * permanent errors should use a domain-specific error class).
   */
  deliver(lead: NormalizedLead, fieldMapping: Record<string, string>): Promise<CrmDeliveryResult>;

  /**
   * Check if a lead with this field/value already exists in the CRM.
   * Returns true if a duplicate is found (throws DuplicateLeadError).
   * Returns false if no duplicate.
   */
  checkDuplicate?(field: 'phone' | 'email', value: string): Promise<boolean>;
}

// ── Factory: instantiate the right adapter from dest_type ──

export async function getCrmAdapter(
  destType: string,
  credentials: string,
): Promise<CrmAdapter> {
  switch (destType) {
    case 'bitrix24': {
      const { BitrixAdapter } = await import('./adapters/bitrix-adapter.js');
      return new BitrixAdapter(credentials);
    }
    case 'amocrm': {
      const { AmoCrmAdapter } = await import('./adapters/amocrm-adapter.js');
      return new AmoCrmAdapter(credentials);
    }
    case 'google_sheets': {
      const { GoogleSheetsAdapter } = await import('./adapters/google-sheets-adapter.js');
      return new GoogleSheetsAdapter(credentials);
    }
    default:
      throw new Error(`Noma'lum CRM turi: ${destType}`);
  }
}
