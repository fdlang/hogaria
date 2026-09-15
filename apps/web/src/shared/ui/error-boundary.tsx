/**
 * ErrorBoundary — React's class API is the only way to catch render errors.
 * Wrap the tree at the top AND around high-risk subtrees (PDF viewer, signature canvas).
 */

import React, { Component, ReactNode } from "react";

interface ErrorInfo { componentStack: string }

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production, ship to Sentry/Datadog here
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div style={{ padding: 40, textAlign: "center", color: "#f87171", fontFamily: "system-ui" }}>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>Algo ha fallado.</h2>
          <p style={{ color: "#71685e", marginBottom: 20 }}>{this.state.error.message}</p>
          <button onClick={this.reset} style={{ padding: "10px 20px", background: "#c17248", border: 0, borderRadius: 6, cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
