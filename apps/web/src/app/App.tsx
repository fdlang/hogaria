/**
 * App — composition of routes for all three roles.
 *
 * Each route is guarded by role, unpacks URL parameters if any
 * (e.g. /admin/projects/:id) and passes down ONLY the APIs the
 * route actually needs.
 */

import { ProjectsApi }    from "@/features/projects/api/projects.api";
import { WorkApi } from "@/features/work/work.api";
import { WorkPage } from "@/features/work/WorkPage";
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
import { CatalogManager } from "@/features/catalog/CatalogManager";

import { AdminUsers }         from "@/features/users/components/AdminUsers";
import { AdminProfesionales } from "@/features/users/components/AdminProfesionales";
import { AdminActivity }      from "@/features/audit/components/AdminActivity";

import { LoginPage }     from "@/features/auth/components/LoginPage";
import { ActivateAccountPage } from "@/features/auth/components/ActivateAccountPage";
import { PublicLanding } from "@/features/solicitudes/components/PublicLanding";
import { PrivacyPolicyPage } from "@/features/legal/components/PrivacyPolicyPage";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth }                     from "@/features/auth/hooks/useAuth";
import { Router, Route, useNavigation } from "./Router";
import { DesktopNavigation } from "./DesktopNavigation";
import { adminNavigation, navigationFor, isNavigationActive } from "./navigation";
import { Button, EmptyState }          from "@/shared/ui";

interface AllApis {
  work: WorkApi;
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
    { path: "#/admin/work", roles: ["admin"], element: <WorkPage api={apis.work} projects={apis.projects} users={apis.users}/> },
    { path: "#/admin",                 roles: ["admin"],        element: <AdminHome /> },
    { path: "#/admin/projects",        roles: ["admin"],        element: <AdminProjectsRoute apis={apis} /> },
    { path: "#/admin/projects/",       roles: ["admin"],        element: <AdminProjectDetailRoute apis={apis} /> },
    { path: "#/admin/budgets",         roles: ["admin"],        element: <SalesPipeline api={apis.sales} users={apis.users} /> },
    { path: "#/admin/catalog",         roles: ["admin"],        element: <CatalogManager api={apis.sales} /> },
    { path: "#/admin/users",           roles: ["admin"],        element: <AdminUsers api={apis.users} /> },
    { path: "#/admin/profesionales",   roles: ["admin"],        element: <AdminProfesionales apis={apis} /> },
    { path: "#/admin/solicitudes",     roles: ["admin"],        element: <AdminSolicitudes api={apis.adminSolicitudes} /> },
    { path: "#/admin/audit",           roles: ["admin"],        element: <AdminActivity api={apis.audit} /> },

    // Cliente
    { path: "#/cliente",               roles: ["cliente"],      element: <ClientDashboardRoute apis={apis} /> },
    { path: "#/cliente/projects/",     roles: ["cliente"],      element: <ClientProjectDetailRoute apis={apis} /> },
    { path: "#/cliente/budgets",       roles: ["cliente"],      element: <ClientEstimates api={apis.sales} projectsApi={apis.projects} /> },

    // Profesional
    { path: "#/profesional/work", roles: ["profesional"], element: <WorkPage api={apis.work} projects={apis.projects} users={apis.users}/> },
    { path: "#/profesional",           roles: ["profesional"],  element: <ProfesionalDashboardRoute apis={apis} /> },
    { path: "#/profesional/projects/", roles: ["profesional"],  element: <ProfesionalProjectDetailRoute apis={apis} /> },
  ];

  const fallback = status === "unauthenticated" || !user
    ? <PublicLanding api={apis.solicitudes} onLogin={() => { window.location.hash = "#/login"; }} />
    : <EmptyState icon="◎" title="Página no encontrada" hint="Usa el menú para navegar" />;

  return (
    <div className={user ? "app-shell app-shell--private" : "app-shell"} style={{ minHeight: "100vh", background: "var(--marble-light)", color: "var(--ink)" }}>
      <Router routes={routes} fallback={fallback} layout={(content) => <>
        {user && <TopBar user={user} onSignOut={signOut} />}
        <main className={user ? "private-main" : undefined} style={user ? { maxWidth: 1200, margin: "0 auto", padding: 32 } : undefined}>
          {content}
        </main>
      </>} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TopBar — role-aware navigation
// ─────────────────────────────────────────────────────────────

function TopBar({ user, onSignOut }: { user: { nombre: string; rol: "admin" | "cliente" | "profesional" } | null; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { currentPath } = useNavigation();
  const groups = navigationFor(user?.rol);

  useEffect(() => { setMenuOpen(false); }, [currentPath]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);


  return (
    <header className={`private-topbar private-topbar--${user?.rol ?? "guest"}`} style={{ display: "flex", justifyContent: "space-between", minHeight: 70, padding: "14px 32px", borderBottom: "1px solid var(--line)", background: "rgba(247,239,229,.92)", alignItems: "center", position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(12px)" }}>
      <a className="private-brand" href={user ? `#/${user.rol}` : "#/"} style={{ color: "var(--graphite)", fontWeight: 700, fontSize: 22, textDecoration: "none" }}>
        <img className="private-brand-symbol" src="/brand/hogaria-isotipo.png" alt="" />
        <img className="private-brand-wordmark" src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" />
      </a>

      {user ? (
        <>
        <button className="private-mobile-menu-toggle" type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="private-mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>
          <span className="private-mobile-menu-icon" aria-hidden="true"><span /><span /><span /></span>
        </button>
        <DesktopNavigation groups={groups} currentPath={currentPath} grouped={user.rol === "admin"} />
        <div className="private-account" aria-label="Cuenta">
          <span title={user.nombre}>{user.nombre}</span>
          <Button small variant="ghost" onClick={onSignOut}>Salir</Button>
        </div>
        {menuOpen && <div className="private-mobile-menu-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
          <aside id="private-mobile-navigation" className="private-mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Menú privado">
            <header><div><p className="eyebrow">Área privada</p><strong>{user.nombre}</strong></div><button type="button" className="private-mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><span className="private-mobile-menu-icon private-mobile-menu-icon--close" aria-hidden="true"><span /><span /><span /></span></button></header>
            <nav aria-label="Secciones privadas">{groups.map((group) => group.links.length > 0 && <section key={group.label}><p>{group.label}</p>{group.links.map((link) => <a key={link.to} href={link.to} aria-current={isNavigationActive(currentPath, link.to) ? "page" : undefined} onClick={() => setMenuOpen(false)}>{link.label}</a>)}</section>)}</nav>
            <Button variant="ghost" onClick={() => { setMenuOpen(false); onSignOut(); }}>Salir del área privada</Button>
          </aside>
        </div>}
        </>
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
    <section className="admin-home">
      <h1 style={{ fontSize: 38, fontWeight: 700, color: "#302d29", marginBottom: 24 }}>Panel de administración</h1>
      {adminNavigation.slice(1).map((group) => (
        <AdminHomeGroup key={group.label} label={group.label} hint={group.hint}>
          {group.links.map((link) => <Tile key={link.to} href={link.to} title={link.label} subtitle={link.subtitle ?? ""} />)}
        </AdminHomeGroup>
      ))}
    </section>
  );
}

function AdminHomeGroup({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <section className="admin-home-group"><header><h2>{label}</h2><p>{hint}</p></header><div className="admin-home-grid">{children}</div></section>;
}

function Tile({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <a href={href} className="admin-home-tile">
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
