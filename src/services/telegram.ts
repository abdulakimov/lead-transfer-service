import type { NormalizedLead } from './facebook.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

interface TelegramSendResult {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

// ── Send a plain text message ──

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API xatosi (${response.status}): ${body}`);
  }

  const result = (await response.json()) as TelegramSendResult;
  if (!result.ok) {
    throw new Error(`Telegram xatosi: ${result.description ?? 'noma\'lum'}`);
  }
}

// ── Format a lead notification message ──

export function formatLeadNotification(
  lead: NormalizedLead,
  integrationName: string,
  bitrixLeadId?: number,
): string {
  const lines: string[] = [
    `<b>Yangi lead!</b> — ${escapeHtml(integrationName)}`,
    '',
  ];

  if (lead.name) lines.push(`👤 <b>Ism:</b> ${escapeHtml(lead.name)}`);
  if (lead.phone) lines.push(`📞 <b>Telefon:</b> ${escapeHtml(lead.phone)}`);
  if (lead.email) lines.push(`📧 <b>Email:</b> ${escapeHtml(lead.email)}`);

  // Extra fields
  for (const [key, value] of Object.entries(lead.rawFields)) {
    if (['full_name', 'name', 'phone_number', 'phone', 'email'].includes(key)) continue;
    if (value) lines.push(`• <b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`);
  }

  if (lead.adName) {
    lines.push('');
    lines.push(`📣 Reklama: ${escapeHtml(lead.adName)}`);
  }

  if (bitrixLeadId) {
    lines.push('');
    lines.push(`✅ Bitrix24 #${bitrixLeadId} ga yetkazildi`);
  }

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
