import type { NavigationIconName } from "./NavigationIcon";

export type NavigationLink = { to: string; label: string; icon?: NavigationIconName; subtitle?: string };
export type NavigationGroup = { label: string; icon?: NavigationIconName; hint: string; links: NavigationLink[] };

// Shared by the desktop menu, mobile menu and administration dashboard.
export const adminNavigation: NavigationGroup[] = [
  { label: "Inicio", icon: "home", hint: "Acceso al panel", links: [
    { to: "#/admin", label: "Inicio", icon: "home" },
  ] },
  { label: "Comercial", icon: "commercial", hint: "Del primer contacto a la propuesta", links: [
    { to: "#/admin/solicitudes", label: "Solicitudes", icon: "inbox", subtitle: "Contactos y solicitudes recibidas" },
    { to: "#/admin/budgets", label: "Presupuestos", icon: "estimate", subtitle: "Oportunidades, propuestas y firma" },
  ] },
  { label: "Obras", icon: "works", hint: "Ejecución y seguimiento", links: [
    { to: "#/admin/projects", label: "Proyectos", icon: "works", subtitle: "Planificación y seguimiento de obras" },
    { to: "#/admin/work", label: "Jornadas y costes", icon: "clock", subtitle: "Fichajes, partes, tarifas y estadísticas" },
  ] },
  { label: "Recursos", icon: "resources", hint: "Equipo y partidas de referencia", links: [
    { to: "#/admin/profesionales", label: "Profesionales", icon: "helmet", subtitle: "Asignaciones y permisos del equipo" },
    { to: "#/admin/catalog", label: "Catálogo", icon: "catalog", subtitle: "Precios y partidas base" },
  ] },
  { label: "Administración", icon: "admin", hint: "Accesos y trazabilidad", links: [
    { to: "#/admin/users", label: "Usuarios y accesos", icon: "users", subtitle: "Cuentas, roles y activaciones" },
    { to: "#/admin/audit", label: "Registro de actividad", icon: "history", subtitle: "Historial de acciones y cambios" },
  ] },
];

export function navigationFor(role?: "admin" | "cliente" | "profesional"): NavigationGroup[] {
  if (role === "admin") return adminNavigation;
  if (role === "cliente") return [{ label: "Mi cuenta", icon: "users", hint: "", links: [
    { to: "#/cliente", label: "Mis obras", icon: "works" },
    { to: "#/cliente/budgets", label: "Presupuestos", icon: "estimate" },
  ] }];
  if (role === "profesional") return [{ label: "Mi trabajo", icon: "clock", hint: "", links: [
    { to: "#/profesional", label: "Mis obras", icon: "works" },
    { to: "#/profesional/work", label: "Mi trabajo", icon: "clock" },
  ] }];
  return [];
}

export function isNavigationActive(currentPath: string, to: string): boolean {
  const path = (currentPath.replace(/^#/, "").split(/[?#]/)[0] ?? "").replace(/\/$/, "");
  const target = to.replace(/^#/, "").replace(/\/$/, "");
  if (path === target) return true;
  // Home is exact-only, except customer/worker project details belong to Mis obras.
  if (target === "/admin") return false;
  if (target === "/cliente" || target === "/profesional") return path.startsWith(`${target}/projects/`);
  return path.startsWith(`${target}/`);
}
