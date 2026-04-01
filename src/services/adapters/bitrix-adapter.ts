import type { CrmAdapter, CrmDeliveryResult } from '../crm-adapter.js';
import type { NormalizedLead } from '../facebook.js';
import { deliverLead, checkDuplicate, applyFieldMapping } from '../bitrix.js';
import { DuplicateLeadError } from '../errors.js';

export class BitrixAdapter implements CrmAdapter {
  constructor(private webhookUrl: string) {}

  async deliver(lead: NormalizedLead, fieldMapping: Record<string, string>): Promise<CrmDeliveryResult> {
    const data = applyFieldMapping(lead, lead.rawFields, fieldMapping);
    const result = await deliverLead(this.webhookUrl, data);
    return { success: true, crmLeadId: result.bitrixLeadId, crmType: 'bitrix24' };
  }

  async checkDuplicate(field: 'phone' | 'email', value: string): Promise<boolean> {
    try {
      return await checkDuplicate(this.webhookUrl, field, value);
    } catch (err) {
      if (err instanceof DuplicateLeadError) throw err;
      throw err;
    }
  }
}
