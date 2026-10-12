import { describe, expect, it } from "vitest";
import {
  canAdministrativelyCancelEstimate,
  canArchiveProject,
  canPermanentlyDeleteEstimate,
  canStartProject,
  canTransitionOpportunity,
  projectStateViolation,
} from "./workflows.js";

const project = {
  estado: "planificacion" as const,
  progreso: 0,
  fechaInicio: new Date("2026-10-01T00:00:00.000Z"),
  fechaFinPrevista: new Date("2026-10-31T00:00:00.000Z"),
  profesionalesAsignados: [{ userId: 2 }],
  hitos: [{ id: "inicio" }],
};

describe("workflow policies", () => {
  it("does not allow manually closing an opportunity as won", () => {
    expect(canTransitionOpportunity("en_estudio", "ganada", "manual")).toBe(false);
    expect(canTransitionOpportunity("en_estudio", "ganada", "signed_conversion")).toBe(true);
  });

  it("requires an operational plan before starting a project", () => {
    expect(canStartProject(project)).toEqual({ ready: true, missing: [] });
    expect(canStartProject({
      ...project,
      fechaFinPrevista: project.fechaInicio,
      profesionalesAsignados: [],
      hitos: [],
    })).toEqual({
      ready: false,
      missing: ["end_after_start", "assigned_professional", "milestone"],
    });
  });

  it("keeps every finalized project at one hundred percent", () => {
    expect(projectStateViolation("finalizado", 99)).toBe("finalized_progress");
    expect(projectStateViolation("finalizado", 100)).toBeNull();
  });

  it("retires commercial records without erasing published history", () => {
    expect(canPermanentlyDeleteEstimate("borrador", 0)).toBe(true);
    expect(canPermanentlyDeleteEstimate("en_revision", 1)).toBe(false);
    expect(canPermanentlyDeleteEstimate("enviado", 0)).toBe(false);
    expect(canAdministrativelyCancelEstimate("enviado")).toBe(true);
    expect(canAdministrativelyCancelEstimate("en_revision", 1)).toBe(true);
    expect(canAdministrativelyCancelEstimate("en_revision", 0)).toBe(false);
    expect(canAdministrativelyCancelEstimate("firmado")).toBe(false);
    expect(canAdministrativelyCancelEstimate("aceptado")).toBe(false);
    expect(canArchiveProject({ archivedAt: null })).toBe(true);
    expect(canArchiveProject({ archivedAt: new Date() })).toBe(false);
  });
});
