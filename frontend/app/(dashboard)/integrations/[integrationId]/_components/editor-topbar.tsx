"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Pencil, Save } from "lucide-react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function EditorTopbar({
  name,
  active,
  saveStatus,
  isNew,
  onNameChange,
  onActiveToggle,
  onSave,
}: {
  name: string;
  active: boolean;
  saveStatus: SaveStatus;
  isNew: boolean;
  onNameChange: (v: string) => void;
  onActiveToggle: () => void;
  onSave: () => void;
}) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 lg:px-6">
      <button
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
        onClick={() => router.push("/integrations")}
        type="button"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Integratsiyalar</span>
      </button>

      <span className="text-[var(--text-secondary)]">/</span>

      {editingName ? (
        <input
          autoFocus
          className="field h-8 flex-1 py-1 text-sm font-medium"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={() => setEditingName(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
          }}
        />
      ) : (
        <button
          className="group flex flex-1 items-center gap-1.5 truncate rounded-lg px-2 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-soft)]"
          onClick={() => setEditingName(true)}
          type="button"
        >
          <span className="truncate">{name || (isNew ? "Yangi integratsiya" : "Nomsiz")}</span>
          <Pencil
            className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
            aria-hidden="true"
          />
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!isNew && (
          <button
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]"
                : "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]"
            }`}
            onClick={onActiveToggle}
            type="button"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[var(--success)]" : "bg-[var(--text-secondary)]"}`}
            />
            {active ? "Faol" : "Nofaol"}
          </button>
        )}

        <button
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
            saveStatus === "saved"
              ? "bg-[var(--success-soft)] text-[var(--success)]"
              : saveStatus === "error"
                ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                : "btn-primary"
          }`}
          onClick={onSave}
          disabled={saveStatus === "saving"}
          type="button"
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Saqlanmoqda...</span>
            </>
          ) : saveStatus === "saved" ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>Saqlandi ✓</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>Saqlash</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
