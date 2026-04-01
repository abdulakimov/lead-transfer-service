import type { CrmAdapter, CrmDeliveryResult } from '../crm-adapter.js';
import type { NormalizedLead } from '../facebook.js';
import { DuplicateLeadError } from '../errors.js';

interface AmoCrmCredentials {
  subdomain: string;
  accessToken: string;
  refreshToken: string;
}

interface AmoContact {
  id: number;
}

interface AmoLead {
  id: number;
}

function getLeadSourceName(lead: NormalizedLead): string {
  return lead.adName === 'Google Form' ? 'Google Form' : 'Facebook Lead Ads';
}

function getLeadTitlePrefix(lead: NormalizedLead): string {
  return lead.adName === 'Google Form' ? 'Google Form Lead' : 'Facebook Lead';
}

// ── AmoCRM OAuth 2.0 adapter ──

export class AmoCrmAdapter implements CrmAdapter {
  private creds: AmoCrmCredentials;

  constructor(credentialsJson: string) {
    this.creds = JSON.parse(credentialsJson) as AmoCrmCredentials;
  }

  private get baseUrl(): string {
    return `https://${this.creds.subdomain}.amocrm.ru/api/v4`;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.creds.accessToken}`,
    };
  }

  async deliver(lead: NormalizedLead, fieldMapping: Record<string, string>): Promise<CrmDeliveryResult> {
    // 1. Create contact
    const contactId = await this.createContact(lead, fieldMapping);

    // 2. Create lead linked to contact
    const leadId = await this.createLead(lead, fieldMapping, contactId);

    return { success: true, crmLeadId: leadId, crmType: 'amocrm' };
  }

  private async createContact(lead: NormalizedLead, mapping: Record<string, string>): Promise<number> {
    const customFields: Array<{ field_code: string; values: Array<{ value: string; enum_code?: string }> }> = [];

    const phone = mapping['phone_number'] ? lead.rawFields[mapping['phone_number']] : lead.phone;
    const email = mapping['email'] ? lead.rawFields[mapping['email']] : lead.email;

    if (phone) {
      customFields.push({ field_code: 'PHONE', values: [{ value: phone, enum_code: 'WORK' }] });
    }
    if (email) {
      customFields.push({ field_code: 'EMAIL', values: [{ value: email, enum_code: 'WORK' }] });
    }

    const body = [{
      name: lead.name || getLeadTitlePrefix(lead),
      custom_fields_values: customFields.length ? customFields : undefined,
    }];

    const response = await fetch(`${this.baseUrl}/contacts`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AmoCRM contact yaratish xatosi (${response.status}): ${text}`);
    }

    const result = (await response.json()) as { _embedded: { contacts: AmoContact[] } };
    return result._embedded.contacts[0].id;
  }

  private async createLead(
    lead: NormalizedLead,
    mapping: Record<string, string>,
    contactId: number,
  ): Promise<number> {
    const name = mapping['ad_name'] ? lead.rawFields[mapping['ad_name']] : lead.adName;

    const prefix = getLeadTitlePrefix(lead);
    const body = [{
      name: name ? `${prefix}: ${name}` : prefix,
      source_name: getLeadSourceName(lead),
      _links: { contacts: [{ id: contactId }] },
    }];

    const response = await fetch(`${this.baseUrl}/leads`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AmoCRM lead yaratish xatosi (${response.status}): ${text}`);
    }

    const result = (await response.json()) as { _embedded: { leads: AmoLead[] } };
    return result._embedded.leads[0].id;
  }

  async checkDuplicate(field: 'phone' | 'email', value: string): Promise<boolean> {
    const type = field === 'phone' ? 'phones' : 'emails';
    const response = await fetch(
      `${this.baseUrl}/contacts?${type}=${encodeURIComponent(value)}`,
      { headers: this.headers },
    );

    if (!response.ok) return false;

    const result = (await response.json()) as { _embedded?: { contacts?: AmoContact[] } };
    const contacts = result._embedded?.contacts ?? [];

    if (contacts.length > 0) {
      throw new DuplicateLeadError(field, value);
    }

    return false;
  }
}
