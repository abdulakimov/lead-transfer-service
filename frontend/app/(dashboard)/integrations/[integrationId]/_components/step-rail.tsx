"use client";

export type EditorStep = 1 | 2 | 3 | 4;

export interface StepSublabels {
  sourceName: string | null;
  destName: string | null;
  mappingCount: number;
  integrationName: string | null;
}

const STEPS: Array<{ step: EditorStep; label: string }> = [
  { step: 1, label: "Manba" },
  { step: 2, label: "Maqsad" },
  { step: 3, label: "Mapping" },
  { step: 4, label: "Sozlamalar" },
];

function getSublabel(step: EditorStep, sublabels: StepSublabels): string {
  if (step === 1) return sublabels.sourceName ?? "—";
  if (step === 2) return sublabels.destName ?? "—";
  if (step === 3) return sublabels.mappingCount > 0 ? `${sublabels.mappingCount} ta maydon` : "—";
  if (step === 4) return sublabels.integrationName ?? "—";
  return "—";
}

export function StepRail({
  activeStep,
  visitedSteps,
  sublabels,
  onStepClick,
}: {
  activeStep: EditorStep;
  visitedSteps: Set<EditorStep>;
  sublabels: StepSublabels;
  onStepClick: (step: EditorStep) => void;
}) {
  return (
    <>
      {/* Desktop: vertical rail */}
      <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface)] p-4 lg:flex">
        {STEPS.map(({ step, label }, idx) => {
          const isActive = activeStep === step;
          const isCompleted = visitedSteps.has(step) && step < activeStep;
          const isVisited = visitedSteps.has(step);
          return (
            <div key={step} className="relative">
              {idx > 0 && (
                <div
                  className={`absolute -top-1 left-[19px] h-1 w-px ${
                    isCompleted ? "bg-[var(--brand)]" : "bg-[var(--border)]"
                  }`}
                />
              )}
              <button
                className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors ${
                  isActive
                    ? "bg-[var(--brand)]/10 text-[var(--text-primary)]"
                    : isVisited
                      ? "text-[var(--text-primary)] hover:bg-[var(--surface-soft)]"
                      : "cursor-default text-[var(--text-secondary)]"
                }`}
                onClick={() => isVisited && onStepClick(step)}
                type="button"
                disabled={!isVisited}
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    isActive
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : isCompleted
                        ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                        : "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]"
                  }`}
                >
                  {step}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {getSublabel(step, sublabels)}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Mobile: horizontal tabs */}
      <nav className="flex border-b border-[var(--border)] bg-[var(--surface)] lg:hidden">
        {STEPS.map(({ step, label }) => {
          const isActive = activeStep === step;
          const isVisited = visitedSteps.has(step);
          return (
            <button
              key={step}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                isActive
                  ? "border-b-2 border-[var(--brand)] font-semibold text-[var(--brand)]"
                  : isVisited
                    ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    : "cursor-default text-[var(--border)]"
              }`}
              onClick={() => isVisited && onStepClick(step)}
              type="button"
              disabled={!isVisited}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive
                    ? "bg-[var(--brand)] text-white"
                    : isVisited
                      ? "bg-[var(--surface-soft)] text-[var(--text-secondary)]"
                      : "bg-[var(--border)] text-[var(--surface)]"
                }`}
              >
                {step}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
