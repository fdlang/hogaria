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

export function StatCard({ label, value, hint, accent = "#c8a96e", icon }: Props) {
  return (
    <div style={{
      padding: 18,
      background: "#141411",
      border: "1px solid #2a2a26",
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10,
      minWidth: 180,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {icon && <span style={{ color: accent, fontSize: 14 }}>{icon}</span>}
        <span style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, color: "#f0ede6", fontWeight: 600, fontFamily: "Cormorant Garamond, serif", lineHeight: 1 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
