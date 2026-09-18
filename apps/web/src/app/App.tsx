/**
 * App — composition of routes for all three roles.
 *
 * Each route is guarded by role, unpacks URL parameters if any
 * (e.g. /admin/projects/:id) and passes down ONLY the APIs the
 * route actually needs.
 */

import { ProjectsApi }    from "@/features/projects/api/projects.api";
import { UsersApi }       from "@/features/users/api/users.api";
import { FilesApi }       from "@/features/files/api/files.api";
import { AuditApi }       from "@/features/audit/api/audit.api";
import { SolicitudesApi } from "@/features/solicitudes/api/solicitudes.api";
import { AdminSolicitudesApi, AdminSolicitudes } from "@/features/solicitudes/components/AdminSolicitudes";

import { AdminProjects }       from "@/features/projects/components/AdminProjects";
import { ProfesionalDashboard } from "@/features/projects/components/ProfesionalDashboard";
import { ProjectDetail }       from "@/features/projects/components/ProjectDetail";

import { SalesApi } from "@/features/sales/api/sales.api";
import { SalesPipeline } from "@/features/sales/components/SalesPipeline";
import { ClientEstimates } from "@/features/sales/components/ClientEstimates";

import { AdminUsers }         from "@/features/users/components/AdminUsers";
import { AdminProfesionales } from "@/features/users/components/AdminProfesionales";
import { AdminActivity }      from "@/features/audit/components/AdminActivity";

import { LoginPage }     from "@/features/auth/components/LoginPage";
import { ActivateAccountPage } from "@/features/auth/components/ActivateAccountPage";
import { PublicLanding } from "@/features/solicitudes/components/PublicLanding";
import { PrivacyPolicyPage } from "@/features/legal/components/PrivacyPolicyPage";

import { useAuth }                     from "@/features/auth/hooks/useAuth";
import { Router, Route, useNavigation } from "./Router";
import { Button, EmptyState }          from "@/shared/ui";

interface AllApis {
  projects:         ProjectsApi;
  users:            UsersApi;
  files:            FilesApi;
  audit:            AuditApi;
  solicitudes:      SolicitudesApi;
  adminSolicitudes: AdminSolicitudesApi;
  sales:            SalesApi;
}

export function App({ apis }: { apis: AllApis }) {
  const { user, signOut, status } = useAuth();

  const routes: Route[] = [
    // Public
    { path: "#/",      element: <PublicLandingRoute apis={apis} /> },
    { path: "#/privacidad", element: <PrivacyPolicyPage /> },
    { path: "#/login", element: <LoginRoute /> },
    { path: "#/activar-cuenta", element: <ActivateAccountPage api={apis.users} /> },

    // Admin
    { path: "#/admin",                 roles: ["admin"],        element: <AdminHome /> },
    { path: "#/admin/projects",        roles: ["admin"],        element: <AdminProjectsRoute apis={apis} /> },
    { path: "#/admin/projects/",       roles: ["admin"],        element: <AdminProjectDetailRoute apis={apis} /> },
    { path: "#/admin/budgets",         roles: ["admin"],        element: <SalesPipeline api={apis.sales} users={apis.users} /> },
    { path: "#/admin/users",           roles: ["admin"],        element: <AdminUsers api={apis.users} /> },
    { path: "#/admin/profesionales",   roles: ["admin"],        element: <AdminProfesionales apis={apis} /> },
    { path: "#/admin/solicitudes",     roles: ["admin"],        element: <AdminSolicitudes api={apis.adminSolicitudes} /> },
    { path: "#/admin/audit",           roles: ["admin"],        element: <AdminActivity api={apis.audit} /> },

    // Cliente
    { path: "#/cliente",               roles: ["cliente"],      element: <ClientDashboardRoute apis={apis} /> },
    { path: "#/cliente/projects/",     roles: ["cliente"],      element: <ClientProjectDetailRoute apis={apis} /> },
    { path: "#/cliente/budgets",       roles: ["cliente"],      element: <ClientEstimates api={apis.sales} projectsApi={apis.projects} /> },

    // Profesional
    { path: "#/profesional",           roles: ["profesional"],  element: <ProfesionalDashboardRoute apis={apis} /> },
    { path: "#/profesional/projects/", roles: ["profesional"],  element: <ProfesionalProjectDetailRoute apis={apis} /> },
  ];

  const fallback = status === "unauthenticated" || !user
    ? <PublicLanding api={apis.solicitudes} onLogin={() => { window.location.hash = "#/login"; }} />
    : <EmptyState icon="◎" title="Página no encontrada" hint="Usa el menú para navegar" />;

  return (
    <div className={user ? "app-shell app-shell--private" : "app-shell"} style={{ minHeight: "100vh", background: "var(--marble-light)", color: "var(--ink)" }}>
      {user && <TopBar user={user} onSignOut={signOut} />}
      <main className={user ? "private-main" : undefined} style={user ? { maxWidth: 1200, margin: "0 auto", padding: 32 } : undefined}>
        <Router routes={routes} fallback={fallback} />
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TopBar — role-aware navigation
// ─────────────────────────────────────────────────────────────
function TopBar({ user, onSignOut }: { user: { nombre: string; rol: "admin" | "cliente" | "profesional" } | null; onSignOut: () => void }) {
  const links =
    user?.rol === "admin" ? [
      { to: "#/admin",               label: "Inicio" },
      { to: "#/admin/projects",      label: "Proyectos" },
      { to: "#/admin/budgets",       label: "Presupuestos" },
      { to: "#/admin/users",         label: "Usuarios" },
      { to: "#/admin/profesionales", label: "Profesionales" },
      { to: "#/admin/solicitudes",   label: "Solicitudes" },
      { to: "#/admin/audit",         label: "Actividad" },
    ] :
    user?.rol === "cliente" ? [
      { to: "#/cliente",           label: "Inicio" },
      { to: "#/cliente/budgets",   label: "Presupuestos" },
    ] :
    user?.rol === "profesional" ? [
      { to: "#/profesional", label: "Inicio" },
    ] : [];

  return (
    <header className="private-topbar" style={{ display: "flex", justifyContent: "space-between", minHeight: 70, padding: "14px 32px", borderBottom: "1px solid var(--line)", background: "rgba(247,239,229,.92)", alignItems: "center", position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(12px)" }}>
      <a className="private-brand" href={user ? `#/${user.rol}` : "#/"} style={{ color: "var(--graphite)", fontWeight: 700, fontSize: 22, textDecoration: "none" }}>
        <img className="private-brand-symbol" src="/brand/hogaria-isotipo.png" alt="" />
        <img className="private-brand-wordmark" src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" />
      </a>

      {user ? (
        <nav className="private-nav" aria-label="Navegación privada" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {links.map(l => (
            <a key={l.to} href={l.to}
              className="private-nav-link"
              style={{ fontSize: 13, fontWeight: 700, color: "#71685e", textDecoration: "none", textTransform: "uppercase", letterSpacing: ".05em", transition: "color .18s ease" }}>
              {l.label}
            </a>
          ))}
          <span style={{ fontSize: 12, color: "#85786b" }}>·</span>
          <span style={{ fontSize: 12, color: "#71685e" }}>{user.nombre}</span>
          <Button small variant="ghost" onClick={onSignOut}>Salir</Button>
        </nav>
      ) : (
        <a href="#/login" style={{ color: "#c17248", fontSize: 13, textDecoration: "none" }}>Iniciar sesión →</a>
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// Route wrappers
// ─────────────────────────────────────────────────────────────
function PublicLandingRoute({ apis }: { apis: AllApis }) {
  return <PublicLanding api={apis.solicitudes} onLogin={() => { window.location.hash = "#/login"; }} />;
}

function LoginRoute() {
  return <LoginPage
    onSuccess={role => { window.location.hash = `#/${role}`; }}
    onBack={() => { window.location.hash = "#/"; }}
  />;
}

function AdminHome() {
  return (
    <section>
      <h1 style={{ fontSize: 38, fontWeight: 700, color: "#302d29", marginBottom: 24 }}>Panel de administración</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        <Tile href="#/admin/projects"      title="Proyectos"      subtitle="Gestiona obras activas" />
        <Tile href="#/admin/budgets"       title="Presupuestos"   subtitle="Crea, envía, firma" />
        <Tile href="#/admin/users"         title="Usuarios"       subtitle="Clientes, profesionales, admins" />
        <Tile href="#/admin/profesionales" title="Profesionales"  subtitle="Asignaciones y permisos" />
        <Tile href="#/admin/solicitudes"   title="Solicitudes"    subtitle="Contactos de la landing" />
        <Tile href="#/admin/audit"         title="Actividad"      subtitle="Audit log y trazabilidad" />
      </div>
    </section>
  );
}

function Tile({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <a href={href} style={{ display: "block", padding: 20, background: "rgba(255,250,244,.86)", border: "1px solid var(--line)", borderRadius: 10, textDecoration: "none", boxShadow: "0 8px 24px rgba(72,59,44,.08)" }}>
      <h3 style={{ color: "#c17248", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{title}</h3>
      <p style={{ fontSize: 12, color: "#71685e" }}>{subtitle}</p>
    </a>
  );
}

function AdminProjectsRoute({ apis }: { apis: AllApis }) {
  const { navigate } = useNavigation();
  return <AdminProjects api={apis.projects} onOpenProject={id => navigate(`#/admin/projects/${id}`)} />;
}

function AdminProjectDetailRoute({ apis }: { apis: AllApis }) {
  const { currentPath, navigate } = useNavigation();
  const id = parseInt(currentPath.split("/").pop() ?? "0", 10);
  return <ProjectDetail apis={apis} projectId={id} onBack={() => navigate("#/admin/projects")} />;
}

function ClientDashboardRoute({ apis }: { apis: AllApis }) {
  return <ClientEstimates api={apis.sales} projectsApi={apis.projects} />;
}

function ClientProjectDetailRoute({ apis }: { apis: AllApis }) {
  const { currentPath, navigate } = useNavigation();
  const id = parseInt(currentPath.split("/").pop() ?? "0", 10);
  return <ProjectDetail apis={apis} projectId={id} onBack={() => navigate("#/cliente")} />;
}

function ProfesionalDashboardRoute({ apis }: { apis: AllApis }) {
  const { navigate } = useNavigation();
  return <ProfesionalDashboard apis={apis} onOpenProject={id => navigate(`#/profesional/projects/${id}`)} />;
}

function ProfesionalProjectDetailRoute({ apis }: { apis: AllApis }) {
  const { currentPath, navigate } = useNavigation();
  const id = parseInt(currentPath.split("/").pop() ?? "0", 10);
  return <ProjectDetail apis={apis} projectId={id} onBack={() => navigate("#/profesional")} />;
}
