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
    <div className="private-stat-card" style={{ borderLeftColor: accent }}>
      <div className="private-stat-card__label">
        {icon && <span style={{ color: accent }}>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="private-stat-card__value">{value}</div>
      {hint && <div className="private-stat-card__hint">{hint}</div>}
    </div>
  );
}
