/**
 * App — composition of routes for all three roles.
 *
 * Each route is guarded by role, unpacks URL parameters if any
 * (e.g. /admin/projects/:id) and passes down ONLY the APIs the
 * route actually needs.
 */

import type { ProjectsApi } from "@/features/projects/api/projects.api";
import type { WorkApi } from "@/features/work/work.api";
import type { UsersApi } from "@/features/users/api/users.api";
import type { FilesApi } from "@/features/files/api/files.api";
import type { AuditApi } from "@/features/audit/api/audit.api";
import type { SolicitudesApi } from "@/features/solicitudes/api/solicitudes.api";
import type { AdminSolicitudesApi } from "@/features/solicitudes/api/admin-solicitudes.api";
import type { SalesApi } from "@/features/sales/api/sales.api";
import { PublicLanding } from "@/features/solicitudes/components/PublicLanding";

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth }                     from "@/features/auth/hooks/useAuth";
import { Router, Route, useNavigation } from "./Router";
import { NavigationIcon, type NavigationIconName } from "./NavigationIcon";
import { DesktopNavigation } from "./DesktopNavigation";
import { adminNavigation, navigationFor, isNavigationActive } from "./navigation";
import { Button, EmptyState }          from "@/shared/ui";
import type { UserNotificationsApi } from "@/features/notifications/api/notifications.api";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";

const WorkPage = lazy(() => import("@/features/work/WorkPage").then(module => ({ default: module.WorkPage })));
const AdminSolicitudes = lazy(() => import("@/features/solicitudes/components/AdminSolicitudes").then(module => ({ default: module.AdminSolicitudes })));
const AdminProjects = lazy(() => import("@/features/projects/components/AdminProjects").then(module => ({ default: module.AdminProjects })));
const ProfesionalDashboard = lazy(() => import("@/features/projects/components/ProfesionalDashboard").then(module => ({ default: module.ProfesionalDashboard })));
const ProjectDetail = lazy(() => import("@/features/projects/components/ProjectDetail").then(module => ({ default: module.ProjectDetail })));
const SalesPipeline = lazy(() => import("@/features/sales/components/SalesPipeline").then(module => ({ default: module.SalesPipeline })));
const ClientEstimates = lazy(() => import("@/features/sales/components/ClientEstimates").then(module => ({ default: module.ClientEstimates })));
const CatalogManager = lazy(() => import("@/features/catalog/CatalogManager").then(module => ({ default: module.CatalogManager })));
const AdminUsers = lazy(() => import("@/features/users/components/AdminUsers").then(module => ({ default: module.AdminUsers })));
const AdminProfesionales = lazy(() => import("@/features/users/components/AdminProfesionales").then(module => ({ default: module.AdminProfesionales })));
const AdminActivity = lazy(() => import("@/features/audit/components/AdminActivity").then(module => ({ default: module.AdminActivity })));
const LoginPage = lazy(() => import("@/features/auth/components/LoginPage").then(module => ({ default: module.LoginPage })));
const ActivateAccountPage = lazy(() => import("@/features/auth/components/ActivateAccountPage").then(module => ({ default: module.ActivateAccountPage })));
const PrivacyPolicyPage = lazy(() => import("@/features/legal/components/PrivacyPolicyPage").then(module => ({ default: module.PrivacyPolicyPage })));

interface AllApis {
  work: WorkApi;
  projects:         ProjectsApi;
  users:            UsersApi;
  files:            FilesApi;
  audit:            AuditApi;
  solicitudes:      SolicitudesApi;
  adminSolicitudes: AdminSolicitudesApi;
  sales:            SalesApi;
  notifications:    UserNotificationsApi;
}

export function App({ apis }: { apis: AllApis }) {
  const { user, signOut, status } = useAuth();

  useEffect(() => {
    const privatePath = window.location.hash.startsWith("#/")
      ? window.location.hash.slice(1)
      : window.location.pathname;
    if (status === "unauthenticated" && /^\/(admin|cliente|profesional)(?:\/|$)/.test(privatePath)) {
      window.location.hash = "#/login";
    }
  }, [status]);

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
    { path: "#/cliente/budgets",       roles: ["cliente"],      element: <ClientEstimates api={apis.sales} projectsApi={apis.projects} view="budgets" /> },

    // Profesional
    { path: "#/profesional/work", roles: ["profesional"], element: <WorkPage api={apis.work} projects={apis.projects} users={apis.users}/> },
    { path: "#/profesional",           roles: ["profesional"],  element: <ProfesionalDashboardRoute apis={apis} /> },
    { path: "#/profesional/projects/", roles: ["profesional"],  element: <ProfesionalProjectDetailRoute apis={apis} /> },
  ];

  const fallback = status === "unauthenticated" || !user
    ? <PublicLanding api={apis.solicitudes} onLogin={() => { window.location.hash = "#/login"; }} />
    : <EmptyState icon="◎" title="Página no encontrada" hint="Usa el menú para navegar" />;

  return (
    <div className={user ? `app-shell app-shell--private app-shell--${user.rol}` : "app-shell"} style={{ minHeight: "100vh", background: "var(--marble-light)", color: "var(--ink)" }}>
      <Router routes={routes} fallback={fallback} layout={(content) => <>
        {user && <TopBar user={user} onSignOut={signOut} notifications={apis.notifications} />}
        <main className={user ? `private-main private-main--${user.rol}` : undefined} style={user ? { maxWidth: 1200, margin: "0 auto", padding: 32 } : undefined}>
          <Suspense fallback={<p role="status" aria-live="polite">Cargando sección…</p>}>
            {content}
          </Suspense>
        </main>
      </>} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TopBar — role-aware navigation
// ─────────────────────────────────────────────────────────────

function TopBar({ user, onSignOut, notifications }: { user: { nombre: string; rol: "admin" | "cliente" | "profesional" } | null; onSignOut: () => void | Promise<void>; notifications: UserNotificationsApi }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const { currentPath, navigate } = useNavigation();
  const groups = navigationFor(user?.rol);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await onSignOut();
    navigate("#/");
  };

  useEffect(() => { setMenuOpen(false); }, [currentPath]);

  useEffect(() => {
    if (!menuOpen) return;
    const panel = menuPanelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
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
        <img className="private-brand-symbol" src="/brand/hogaria-isotipo-192.png" alt="" width="192" height="180" />
        <img className="private-brand-wordmark" src="/brand/hogaria-wordmark-480.png" alt="Hogaria Reformas Integrales" width="480" height="104" />
      </a>

      {user ? (
        <>
        <button ref={menuToggleRef} className="private-mobile-menu-toggle" type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="private-mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>
          <span className="private-mobile-menu-icon" aria-hidden="true"><span /><span /><span /></span>
        </button>
        <DesktopNavigation groups={groups} currentPath={currentPath} grouped={user.rol === "admin"} />
        <NotificationBell api={notifications} role={user.rol} navigate={navigate}/>
        <div className="private-account" aria-label="Cuenta">
          <span title={user.nombre}>{user.nombre}</span>
          <Button small variant="ghost" onClick={() => void handleSignOut()}>Salir</Button>
        </div>
        {menuOpen && <div className="private-mobile-menu-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
          <aside ref={menuPanelRef} id="private-mobile-navigation" className="private-mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Menú privado">
            <header><div><p className="eyebrow">Área privada</p><strong>{user.nombre}</strong></div><button type="button" className="private-mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><span className="private-mobile-menu-icon private-mobile-menu-icon--close" aria-hidden="true"><span /><span /><span /></span></button></header>
            <nav aria-label="Secciones privadas">{groups.map((group) => group.links.length > 0 && <section key={group.label}><p><NavigationIcon name={group.icon} />{group.label}</p>{group.links.map((link) => <a key={link.to} href={link.to} aria-current={isNavigationActive(currentPath, link.to) ? "page" : undefined} onClick={() => setMenuOpen(false)}>{link.label}</a>)}</section>)}</nav>
            <Button variant="ghost" onClick={() => void handleSignOut()}>Salir del área privada</Button>
          </aside>
        </div>}
        </>
      ) : (
        <a href="#/login" style={{ color: "var(--copper-dark)", fontSize: 13, textDecoration: "none" }}>Iniciar sesión →</a>
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
      <header className="admin-home__hero">
        <p className="eyebrow">Gestión integral</p>
        <h1>Panel de administración</h1>
        <p>Organiza la actividad comercial, las obras y los recursos desde un único espacio.</p>
      </header>
      {adminNavigation.slice(1).map((group) => (
        <AdminHomeGroup key={group.label} label={group.label} hint={group.hint}>
          {group.links.map((link) => <Tile key={link.to} icon={link.icon} href={link.to} title={link.label} subtitle={link.subtitle ?? ""} />)}
        </AdminHomeGroup>
      ))}
    </section>
  );
}

function AdminHomeGroup({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <section className="admin-home-group"><header><h2>{label}</h2><p>{hint}</p></header><div className="admin-home-grid">{children}</div></section>;
}

function Tile({ href, title, subtitle, icon }: { href: string; title: string; subtitle: string; icon?: NavigationIconName }) {
  return (
    <a href={href} className="admin-home-tile">
      <h3 style={{ color: "var(--copper-dark)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}><NavigationIcon name={icon} />{title}</h3>
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
  return <ClientEstimates api={apis.sales} projectsApi={apis.projects} view="projects" />;
}

function ClientProjectDetailRoute({ apis }: { apis: AllApis }) {
  const { currentPath, navigate } = useNavigation();
  const id = parseInt(currentPath.split("/").pop() ?? "0", 10);
  return <ProjectDetail apis={apis} projectId={id} onBack={() => navigate("#/cliente")} />;
}

function ProfesionalDashboardRoute({ apis }: { apis: AllApis }) {
  const { navigate } = useNavigation();
  return <ProfesionalDashboard
    apis={apis}
    onOpenProject={id => navigate(`#/profesional/projects/${id}`)}
    onOpenWork={() => navigate("#/profesional/work")}
  />;
}

function ProfesionalProjectDetailRoute({ apis }: { apis: AllApis }) {
  const { currentPath, navigate } = useNavigation();
  const id = parseInt(currentPath.split("/").pop() ?? "0", 10);
  return <ProjectDetail apis={apis} projectId={id} onBack={() => navigate("#/profesional")} />;
}
