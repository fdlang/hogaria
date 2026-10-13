export function isMaintenanceModeEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
