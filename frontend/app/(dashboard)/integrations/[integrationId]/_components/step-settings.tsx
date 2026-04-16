"use client";

export function StepSettings({
  name, notifyTelegramChatId, dedupEnabled, dedupField,
  onNameChange, onTelegramChange, onDedupEnabledChange, onDedupFieldChange,
}: {
  name: string;
  notifyTelegramChatId: string;
  dedupEnabled: boolean;
  dedupField: "phone" | "email";
  onNameChange: (v: string) => void;
  onTelegramChange: (v: string) => void;
  onDedupEnabledChange: (v: boolean) => void;
  onDedupFieldChange: (v: "phone" | "email") => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sozlamalar</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Integratsiya nomi, bildirishnomalar va dedup.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div>
          <label className="label">Integratsiya nomi</label>
          <input
            className="field"
            placeholder="Masalan: Meta Lead → Bitrix Sales"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Telegram Chat ID (bildirishnomalar uchun)</label>
          <input
            className="field"
            placeholder="-100xxxxxxxxx"
            value={notifyTelegramChatId}
            onChange={(e) => onTelegramChange(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Har bir yangi lid uchun Telegram xabar yuboriladi</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-[var(--text-primary)]">Duplicate tekshiruvi</p>
            <p className="text-sm text-[var(--text-secondary)]">Bir xil telefon/email bilan kelgan lidlarni o'tkazib yuborish</p>
          </div>
          <button
            className={`relative inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition-colors ${
              dedupEnabled ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--border)] bg-[var(--surface-soft)]"
            }`}
            onClick={() => onDedupEnabledChange(!dedupEnabled)}
            role="switch"
            aria-checked={dedupEnabled}
            type="button"
          >
            <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${dedupEnabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        {dedupEnabled && (
          <div className="mt-4 animate-slide-down">
            <p className="mb-2 text-sm text-[var(--text-secondary)]">Qaysi maydon bo'yicha tekshirish:</p>
            <div className="flex gap-2">
              {(["phone", "email"] as const).map((field) => (
                <button
                  key={field}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    dedupField === field
                      ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
                  }`}
                  onClick={() => onDedupFieldChange(field)}
                  type="button"
                >
                  {field === "phone" ? "Telefon" : "Email"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
