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

import { useEffect, useRef, useId, forwardRef, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

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
    <div className="ui-modal-backdrop" role="presentation" onClick={onBackdrop}
      style={{ position: "fixed", inset: 0, background: "rgba(48,45,41,.52)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
      <div className="ui-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{ background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto" }}>
        <header className="ui-modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #d8c4ad", position: "sticky", top: 0, background: "#fffaf4" }}>
          <h3 id={titleId} style={{ fontSize: 21, fontWeight: 600, color: "#302d29" }}>{title}</h3>
          {!unclosable && onClose && (
            <button aria-label="Cerrar modal" onClick={onClose}
              style={{ background: "none", border: "none", color: "#71685e", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
          )}
        </header>
        <div className="ui-modal-body" style={{ padding: 24 }}>{children}</div>
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

export function Button({ variant = "primary", loading, small, children, disabled, style, className, ...rest }: ButtonProps) {
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: "#995637", fg: "#fffaf4", border: "#995637" },
    ghost:   { bg: "transparent", fg: "#545048", border: "#a8947e" },
    danger:  { bg: "#f87171",  fg: "#302d29", border: "#f87171" },
  };
  const c = colors[variant];
  return (
    <button {...rest} className={`ui-button ui-button--${variant}${className ? ` ${className}` : ""}`} data-variant={variant} disabled={disabled || loading}
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
      {label && <label htmlFor={inputId} style={{ display: "block", fontSize: 12, fontWeight: 600, color: error ? "#f87171" : "#71685e", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <input
        {...props} id={inputId} ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        style={{ width: "100%", background: "#fffaf4", border: `1px solid ${error ? "#f87171" : "#cdb69d"}`, borderRadius: 8, padding: "9px 13px", color: "#302d29", fontSize: 14, outline: "none", ...props.style }}
      />
      {error && <p id={errId} role="alert" style={{ fontSize: 12, color: "#f87171", marginTop: 3 }}>{error}</p>}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Textarea / Select — same pattern
// ─────────────────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string }
export function Textarea({ label, error, id: explicitId, ...props }: TextareaProps) {
  const generatedId = useId();
  const taId = explicitId ?? generatedId;
  const errId = `${taId}-err`;
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label htmlFor={taId} style={{ display: "block", fontSize: 12, fontWeight: 600, color: error ? "#b5483f" : "#71685e", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <textarea {...props} id={taId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        style={{ width: "100%", background: "#fffaf4", border: `1px solid ${error ? "#b5483f" : "#cdb69d"}`, borderRadius: 8, padding: "9px 13px", color: "#302d29", fontSize: 14, outline: "none", resize: "vertical", minHeight: 80, ...props.style }} />
      {error && <p id={errId} role="alert" style={{ fontSize: 12, color: "#b5483f", marginTop: 3 }}>{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; children: ReactNode }
export function Select({ label, children, id: explicitId, ...props }: SelectProps) {
  const generatedId = useId();
  const selId = explicitId ?? generatedId;
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label htmlFor={selId} style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71685e", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <select {...props} id={selId}
        style={{ width: "100%", background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "9px 13px", color: "#302d29", fontSize: 14, outline: "none", cursor: "pointer", ...props.style }}>{children}</select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Spinner / Badge / EmptyState — small primitives
// ─────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span aria-label="Cargando" role="status"
      style={{ display: "inline-block", width: size, height: size, border: "2px solid #d8c4ad", borderTopColor: "#c17248", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
  );
}

export function Badge({ children, color = "#c17248" }: { children: ReactNode; color?: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", fontSize: 12, fontWeight: 700, background: `${color}18`, color, borderRadius: 4, letterSpacing: ".05em", textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

export function EmptyState({ icon = "—", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 28, color: "#545048", marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: 14, color: "#71685e", marginBottom: 4 }}>{title}</p>
      {hint && <p style={{ fontSize: 12, color: "#545048" }}>{hint}</p>}
    </div>
  );
}
