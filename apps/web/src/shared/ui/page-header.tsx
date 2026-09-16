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
    <header className="private-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 38, fontWeight: 700, color: "#302d29", letterSpacing: "-.02em", lineHeight: 1 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: "#71685e", marginTop: 6 }}>{subtitle}</p>}
      </div>
      {actions && <div className="private-page-header__actions" style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </header>
  );
}
