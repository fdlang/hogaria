import { describe, it, expect } from "vitest";
import { adminNavigation, navigationFor, isNavigationActive } from "./navigation";

describe("Private navigation", () => {
  it("shares the same definition and consistent business order", () => {
    expect(navigationFor("admin")).toBe(adminNavigation);
    expect(adminNavigation.map(g => g.label)).toEqual(["Inicio", "Comercial", "Obras", "Recursos", "Administración"]);
    const links = adminNavigation.flatMap(g => g.links);
    expect(new Set(links.map(l => l.to)).size).toBe(links.length);
    expect(links.map(l => l.label)).toEqual(["Inicio", "Solicitudes", "Presupuestos", "Proyectos", "Jornadas y costes", "Profesionales", "Catálogo", "Usuarios y accesos", "Registro de actividad"]);
  });
  it("keeps other roles separate and anonymous navigation empty", () => {
    expect(navigationFor()).toEqual([]);
    for (const role of ["cliente", "profesional"] as const)
      expect(navigationFor(role).flatMap(g => g.links).every(l => l.to.startsWith("#/" + role))).toBe(true);
  });
  it.each([
    ["/admin", "#/admin", true],
    ["/admin/work", "#/admin", false],
    ["/admin/projects/12", "#/admin/projects", true],
    ["/admin/projects-other", "#/admin/projects", false],
    ["#/admin/work/?page=1", "#/admin/work", true],
    ["/cliente/projects/12", "#/cliente", true],
    ["/cliente/budgets", "#/cliente", false],
    ["/profesional/work", "#/profesional", false],
  ])("matches %s to %s: %s", (path, target, active) => {
    expect(isNavigationActive(path, target)).toBe(active);
  });
});
