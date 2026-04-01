"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { Check, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title = "Tasdiqlash",
  message,
  confirmText = "Tasdiqlash",
  cancelText = "Bekor qilish",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        <p className="text-lg font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="btn-ghost" disabled={loading} onClick={onCancel} type="button">
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {cancelText}
          </button>
          <button className="btn-primary" disabled={loading} onClick={onConfirm} type="button">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner size="sm" className="border-[var(--border)] border-t-[var(--surface)]" />
                Bajarilmoqda...
              </span>
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {confirmText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

