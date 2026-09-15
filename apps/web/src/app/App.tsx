/**
 * App — composition of routes for all three roles.
 *
 * Each route is guarded by role, unpacks URL parameters if any
 * (e.g. /admin/projects/:id) and passes down ONLY the APIs the
 * route actually needs.
 */

import { useState } from "react";
import { BudgetsApi }     from "@/features/budgets/api/budgets.api";
import { ProjectsApi }    from "@/features/projects/api/projects.api";
import { UsersApi }       from "@/features/users/api/users.api";
import { FilesApi }       from "@/features/files/api/files.api";
import { AuditApi }       from "@/features/audit/api/audit.api";
import { SolicitudesApi } from "@/features/solicitudes/api/solicitudes.api";
import { AdminSolicitudesApi, AdminSolicitudes } from "@/features/solicitudes/components/AdminSolicitudes";

import { AdminProjects }       from "@/features/projects/components/AdminProjects";
import { ClientDashboard }     from "@/features/projects/components/ClientDashboard";
import { ProfesionalDashboard } from "@/features/projects/components/ProfesionalDashboard";
import { ProjectDetail }       from "@/features/projects/components/ProjectDetail";
import { ProjectForm }         from "@/features/projects/components/ProjectForm";

import { AdminBudgets }  from "@/features/budgets/components/AdminBudgets";
import { ClientBudgets } from "@/features/budgets/components/ClientBudgets";
import { SignatureWizard } from "@/features/signatures/components/SignatureWizard";

import { AdminUsers }         from "@/features/users/components/AdminUsers";
import { AdminProfesionales } from "@/features/users/components/AdminProfesionales";
import { AdminActivity }      from "@/features/audit/components/AdminActivity";

import { LoginPage }     from "@/features/auth/components/LoginPage";
import { PublicLanding } from "@/features/solicitudes/components/PublicLanding";

import { useAuth }                     from "@/features/auth/hooks/useAuth";
import { useUsers }                    from "@/features/users/hooks/useUsers";
import { Router, Route, useNavigation } from "./Router";
import { Button, EmptyState, Modal }   from "@/shared/ui";

interface AllApis {
  budgets:          BudgetsApi;
  projects:         ProjectsApi;
  users:            UsersApi;
  files:            FilesApi;
  audit:            AuditApi;
  solicitudes:      SolicitudesApi;
  adminSolicitudes: AdminSolicitudesApi;
}

export function App({ apis }: { apis: AllApis }) {
  const { user, signOut, status } = useAuth();

  const routes: Route[] = [
    // Public
    { path: "#/",      element: <PublicLandingRoute apis={apis} /> },
    { path: "#/login", element: <LoginRoute /> },

    // Admin
    { path: "#/admin",                 roles: ["admin"],        element: <AdminHome /> },
    { path: "#/admin/projects",        roles: ["admin"],        element: <AdminProjectsRoute apis={apis} /> },
    { path: "#/admin/projects/",       roles: ["admin"],        element: <AdminProjectDetailRoute apis={apis} /> },
    { path: "#/admin/budgets",         roles: ["admin"],        element: <AdminBudgets apis={apis} /> },
    { path: "#/admin/users",           roles: ["admin"],        element: <AdminUsers api={apis.users} /> },
    { path: "#/admin/profesionales",   roles: ["admin"],        element: <AdminProfesionales apis={apis} /> },
    { path: "#/admin/solicitudes",     roles: ["admin"],        element: <AdminSolicitudes api={apis.adminSolicitudes} /> },
    { path: "#/admin/audit",           roles: ["admin"],        element: <AdminActivity api={apis.audit} /> },

    // Cliente
    { path: "#/cliente",               roles: ["cliente"],      element: <ClientDashboardRoute apis={apis} /> },
    { path: "#/cliente/projects/",     roles: ["cliente"],      element: <ClientProjectDetailRoute apis={apis} /> },
    { path: "#/cliente/budgets",       roles: ["cliente"],      element: <ClientBudgets apis={apis} /> },

    // Profesional
    { path: "#/profesional",           roles: ["profesional"],  element: <ProfesionalDashboardRoute apis={apis} /> },
    { path: "#/profesional/projects/", roles: ["profesional"],  element: <ProfesionalProjectDetailRoute apis={apis} /> },
  ];

  const fallback = status === "unauthenticated" || !user
    ? <PublicLanding api={apis.solicitudes} onLogin={() => { window.location.hash = "#/login"; }} />
    : <EmptyState icon="◎" title="Página no encontrada" hint="Usa el menú para navegar" />;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a09", color: "#f0ede6" }}>
      <TopBar user={user} onSignOut={signOut} />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
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
    <header style={{ display: "flex", justifyContent: "space-between", padding: "14px 32px", borderBottom: "1px solid #1a1a18", alignItems: "center" }}>
      <a href={user ? `#/${user.rol}` : "#/"} style={{ color: "#f0ede6", fontWeight: 700, fontSize: 18, textDecoration: "none" }}>
        Reforma<span style={{ color: "#c8a96e" }}>Pro</span>
      </a>

      {user ? (
        <nav style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {links.map(l => (
            <a key={l.to} href={l.to}
              style={{ fontSize: 12, color: "#666", textDecoration: "none", textTransform: "uppercase", letterSpacing: ".05em" }}>
              {l.label}
            </a>
          ))}
          <span style={{ fontSize: 11, color: "#444" }}>·</span>
          <span style={{ fontSize: 12, color: "#666" }}>{user.nombre}</span>
          <Button small variant="ghost" onClick={onSignOut}>Salir</Button>
        </nav>
      ) : (
        <a href="#/login" style={{ color: "#c8a96e", fontSize: 13, textDecoration: "none" }}>Iniciar sesión →</a>
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
      <h1 style={{ fontSize: 38, fontWeight: 700, color: "#f0ede6", marginBottom: 24 }}>Panel de administración</h1>
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
    <a href={href} style={{ display: "block", padding: 20, background: "#141411", border: "1px solid #2a2a26", borderRadius: 10, textDecoration: "none" }}>
      <h3 style={{ color: "#c8a96e", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{title}</h3>
      <p style={{ fontSize: 11, color: "#555" }}>{subtitle}</p>
    </a>
  );
}

function AdminProjectsRoute({ apis }: { apis: AllApis }) {
  const { navigate } = useNavigation();
  const clients = useUsers(apis.users, "cliente");
  const [creating, setCreating] = useState(false);

  return (
    <>
      <AdminProjects
        api={apis.projects}
        onOpenProject={id => navigate(`#/admin/projects/${id}`)}
        onCreateProject={() => setCreating(true)}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo proyecto" width={600}>
        {creating && (
          <ProjectForm api={apis.projects} clients={clients.data ?? []}
            onSaved={p => { setCreating(false); navigate(`#/admin/projects/${p.id}`); }}
            onCancel={() => setCreating(false)} />
        )}
      </Modal>
    </>
  );
}

function AdminProjectDetailRoute({ apis }: { apis: AllApis }) {
  const { currentPath, navigate } = useNavigation();
  const id = parseInt(currentPath.split("/").pop() ?? "0", 10);
  return <ProjectDetail apis={apis} projectId={id} onBack={() => navigate("#/admin/projects")} />;
}

function ClientDashboardRoute({ apis }: { apis: AllApis }) {
  const { navigate } = useNavigation();
  const [signingBudgetId, setSigningBudgetId] = useState<number | null>(null);

  return (
    <>
      <ClientDashboard
        apis={apis}
        onOpenProject={id => navigate(`#/cliente/projects/${id}`)}
        onOpenBudget={() => navigate("#/cliente/budgets")}
        onSignBudget={id => setSigningBudgetId(id)}
      />
      <SignatureWizard
        open={signingBudgetId !== null}
        budgetId={signingBudgetId}
        budgetsApi={apis.budgets}
        onClose={() => setSigningBudgetId(null)}
        onSigned={() => setSigningBudgetId(null)}
      />
    </>
  );
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
