export const isApiMaintenanceModeEnabled = (value: string | undefined) => value === "true";

export const maintenanceResponse = {
  status: 503,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "300" },
  body: { code: "SERVICE_UNAVAILABLE", message: "Hogaria está temporalmente en mantenimiento" },
} as const;
