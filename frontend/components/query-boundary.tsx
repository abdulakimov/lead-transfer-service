"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface QueryBoundaryProps {
  children: ReactNode;
}

interface QueryBoundaryState {
  hasError: boolean;
  message: string;
}

export class QueryBoundary extends Component<QueryBoundaryProps, QueryBoundaryState> {
  state: QueryBoundaryState = {
    hasError: false,
    message: "Unexpected error",
  };

  static getDerivedStateFromError(error: Error): QueryBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unexpected error",
    };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    return;
  }

  reset = () => {
    this.setState({ hasError: false, message: "Unexpected error" });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-3xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-5">
          <p className="text-sm font-semibold text-[var(--danger)]">Data load error</p>
          <p className="mt-1 text-sm text-[var(--danger)]">{this.state.message}</p>
          <button
            className="btn-primary mt-3"
            onClick={this.reset}
            type="button"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

