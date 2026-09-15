/**
 * useConfirm — promise-based confirmation dialog.
 *
 * Replaces the 20+ scattered `if (!confirm("...")) return;` calls in the
 * original file with a single styled Modal that matches app design and is
 * a11y-compliant. Call `ask({ ... })` and await a boolean.
 */

import React, { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { Modal, Button } from "../ui";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

interface Ctx {
  ask: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<Ctx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
      setOpts(o);
    });
  }, []);

  const settle = useCallback((v: boolean) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ ask }}>
      {children}
      <Modal open={!!opts} onClose={() => settle(false)} title={opts?.title ?? ""} width={440}>
        {opts && (
          <>
            <div style={{ fontSize: 14, color: "#71685e", lineHeight: 1.6, marginBottom: 20 }}>{opts.message}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button small variant="ghost" onClick={() => settle(false)}>{opts.cancelLabel ?? "Cancelar"}</Button>
              <Button small variant={opts.variant === "danger" ? "danger" : "primary"} onClick={() => settle(true)}>
                {opts.confirmLabel ?? "Aceptar"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ctx["ask"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx.ask;
}
