/**
 * PageHeader — consistent page title + subtitle + action slot.
 * Used by every admin/client/profesional page to enforce visual consistency.
 */

import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 38, fontWeight: 700, color: "#f0ede6", letterSpacing: "-.02em", lineHeight: 1 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: "#555", marginTop: 6 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </header>
  );
}
