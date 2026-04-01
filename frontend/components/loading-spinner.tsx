"use client";

type SpinnerSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function LoadingSpinner({ size = "md", className = "" }: { size?: SpinnerSize; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-[var(--border)] border-t-[var(--text-primary)] ${SIZE_CLASS[size]} ${className}`}
    />
  );
}

