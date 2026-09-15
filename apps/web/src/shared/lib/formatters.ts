/**
 * Formatters — pure functions, locale-aware.
 * No business logic; no side effects.
 */

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return euro.format(amount);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return number.format(n);
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

export function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
