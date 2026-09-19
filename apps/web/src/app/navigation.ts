export type NavigationLink = { to: string; label: string; subtitle?: string };
export type NavigationGroup = { label: string; hint: string; links: NavigationLink[] };

// Shared by the desktop menu, mobile menu and administration dashboard.
export const adminNavigation: NavigationGroup[] = [
  { label: "Inicio", hint: "Acceso al panel", links: [
    { to: "#/admin", label: "Inicio" },
  ] },
  { label: "Comercial", hint: "Del primer contacto a la propuesta", links: [
    { to: "#/admin/solicitudes", label: "Solicitudes", subtitle: "Contactos y solicitudes recibidas" },
    { to: "#/admin/budgets", label: "Presupuestos", subtitle: "Oportunidades, propuestas y firma" },
  ] },
  { label: "Obras", hint: "Ejecución y seguimiento", links: [
    { to: "#/admin/projects", label: "Proyectos", subtitle: "Planificación y seguimiento de obras" },
    { to: "#/admin/work", label: "Jornadas y costes", subtitle: "Fichajes, partes, tarifas y estadísticas" },
  ] },
  { label: "Recursos", hint: "Equipo y partidas de referencia", links: [
    { to: "#/admin/profesionales", label: "Profesionales", subtitle: "Asignaciones y permisos del equipo" },
    { to: "#/admin/catalog", label: "Catálogo", subtitle: "Precios y partidas base" },
  ] },
  { label: "Administración", hint: "Accesos y trazabilidad", links: [
    { to: "#/admin/users", label: "Usuarios y accesos", subtitle: "Cuentas, roles y activaciones" },
    { to: "#/admin/audit", label: "Registro de actividad", subtitle: "Historial de acciones y cambios" },
  ] },
];

export function navigationFor(role?: "admin" | "cliente" | "profesional"): NavigationGroup[] {
  if (role === "admin") return adminNavigation;
  if (role === "cliente") return [{ label: "Mi cuenta", hint: "", links: [
    { to: "#/cliente", label: "Mis obras" },
    { to: "#/cliente/budgets", label: "Presupuestos" },
  ] }];
  if (role === "profesional") return [{ label: "Mi trabajo", hint: "", links: [
    { to: "#/profesional", label: "Mis obras" },
    { to: "#/profesional/work", label: "Mi trabajo" },
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
