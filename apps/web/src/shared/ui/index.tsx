/**
 * Shared UI primitives — presentational components.
 *
 * Rules:
 *   - NO business logic
 *   - NO direct API calls
 *   - ALL state via props (controlled components)
 *   - Accessible by default (a11y: aria, htmlFor, focus management)
 *
 * Use these via the barrel: `import { Button, Input, Modal } from "@/shared/ui"`
 */

import React, { useEffect, useRef, useId, forwardRef, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

// ─────────────────────────────────────────────────────────────
// Modal — with Escape key, focus trap, proper ARIA
// ─────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  unclosable?: boolean;
}

export function Modal({ open, onClose, title, children, width = 520, unclosable = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !unclosable && onClose) onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, unclosable, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>(
      'button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
    return () => { previousFocus?.focus(); };
  }, [open]);

  if (!open) return null;

  const onBackdrop = () => { if (!unclosable && onClose) onClose(); };

  return (
    <div role="presentation" onClick={onBackdrop}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{ background: "#161614", border: "1px solid #2a2a26", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #2a2a26", position: "sticky", top: 0, background: "#161614" }}>
          <h3 id={titleId} style={{ fontSize: 21, fontWeight: 600, color: "#f0ede6" }}>{title}</h3>
          {!unclosable && onClose && (
            <button aria-label="Cerrar modal" onClick={onClose}
              style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
          )}
        </header>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Button — variants + loading state
// ─────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  small?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", loading, small, children, disabled, style, ...rest }: ButtonProps) {
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: "#c8a96e", fg: "#0a0a09", border: "#c8a96e" },
    ghost:   { bg: "transparent", fg: "#f0ede6", border: "#252520" },
    danger:  { bg: "#f87171",  fg: "#0a0a09", border: "#f87171" },
  };
  const c = colors[variant];
  return (
    <button {...rest} disabled={disabled || loading}
      style={{
        background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
        padding: small ? "6px 12px" : "9px 18px",
        borderRadius: 8, fontSize: small ? 12 : 13, fontWeight: 600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.5 : 1,
        transition: "opacity .15s ease",
        ...style,
      }}>
      {loading ? <Spinner size={small ? 12 : 14} /> : children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Input — a11y-compliant with htmlFor wiring
// ─────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  error?: string | undefined;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, id: explicitId, ...props }, ref) {
  const generatedId = useId();
  const inputId     = explicitId ?? generatedId;
  const errId       = `${inputId}-err`;
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label htmlFor={inputId} style={{ display: "block", fontSize: 11, fontWeight: 600, color: error ? "#f87171" : "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <input
        {...props} id={inputId} ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        style={{ width: "100%", background: "#0c0c0b", border: `1px solid ${error ? "#f87171" : "#252520"}`, borderRadius: 8, padding: "9px 13px", color: "#f0ede6", fontSize: 14, outline: "none", ...props.style }}
      />
      {error && <p id={errId} role="alert" style={{ fontSize: 11, color: "#f87171", marginTop: 3 }}>{error}</p>}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Textarea / Select — same pattern
// ─────────────────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string }
export function Textarea({ label, id: explicitId, ...props }: TextareaProps) {
  const generatedId = useId();
  const taId = explicitId ?? generatedId;
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label htmlFor={taId} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <textarea {...props} id={taId}
        style={{ width: "100%", background: "#0c0c0b", border: "1px solid #252520", borderRadius: 8, padding: "9px 13px", color: "#f0ede6", fontSize: 14, outline: "none", resize: "vertical", minHeight: 80, ...props.style }} />
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; children: ReactNode }
export function Select({ label, children, id: explicitId, ...props }: SelectProps) {
  const generatedId = useId();
  const selId = explicitId ?? generatedId;
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label htmlFor={selId} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <select {...props} id={selId}
        style={{ width: "100%", background: "#0c0c0b", border: "1px solid #252520", borderRadius: 8, padding: "9px 13px", color: "#f0ede6", fontSize: 14, outline: "none", cursor: "pointer", ...props.style }}>{children}</select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Spinner / Badge / EmptyState — small primitives
// ─────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span aria-label="Cargando" role="status"
      style={{ display: "inline-block", width: size, height: size, border: "2px solid #2a2a26", borderTopColor: "#c8a96e", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
  );
}

export function Badge({ children, color = "#c8a96e" }: { children: ReactNode; color?: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", fontSize: 10, fontWeight: 700, background: `${color}18`, color, borderRadius: 4, letterSpacing: ".05em", textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

export function EmptyState({ icon = "—", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 28, color: "#333", marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>{title}</p>
      {hint && <p style={{ fontSize: 12, color: "#333" }}>{hint}</p>}
    </div>
  );
}
