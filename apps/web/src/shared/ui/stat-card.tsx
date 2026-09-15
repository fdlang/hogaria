/**
 * StatCard — KPI tile for dashboards.
 * Presentational. Accepts formatted value so it doesn't couple to any domain.
 */

import { ReactNode } from "react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;    // hex color for the accent bar
  icon?: ReactNode;
}

export function StatCard({ label, value, hint, accent = "#c17248", icon }: Props) {
  return (
    <div style={{
      padding: 18,
      background: "#fffaf4",
      border: "1px solid #d8c4ad",
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10,
      minWidth: 180,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {icon && <span style={{ color: accent, fontSize: 14 }}>{icon}</span>}
        <span style={{ fontSize: 10, color: "#71685e", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, color: "#302d29", fontWeight: 600, fontFamily: "Cormorant Garamond, serif", lineHeight: 1 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: "#71685e", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
