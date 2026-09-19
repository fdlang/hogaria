/**
 * Projects hooks — refactored onto the shared useResource primitives.
 * Optimistic updates for the mutation hooks.
 */

import { useCallback } from "react";
import { ProjectsApi, ProjectDTO } from "../api/projects.api";
import { useResource, useMutation, withOptimistic } from "@/shared/hooks/useResource";

export function useProjects(api: ProjectsApi) {
  return useResource<ProjectDTO[]>(() => api.list(), [api]);
}

export function useProject(api: ProjectsApi, id: number | null) {
  return useResource<ProjectDTO | null>(
    () => id == null ? Promise.resolve(null) : api.get(id),
    [api, id],
  );
}

export function useProjectMutations(api: ProjectsApi) {
  const update   = useMutation((id: number, changes: Partial<ProjectDTO>) => api.update(id, changes));
  const remove   = useMutation((id: number) => api.delete(id));
  const assign   = useMutation((projectId: number, userId: number, profesion: string) =>
    api.assign(projectId, userId, profesion));
  const unassign = useMutation((projectId: number, userId: number) =>
    api.unassign(projectId, userId));
  return { update, remove, assign, unassign };
}

// Specialised optimistic helpers used by detail views
export function useProgressUpdater(api: ProjectsApi, resource: ReturnType<typeof useProject>) {
  return useCallback(async (progreso: number) => {
    const current = resource.data;
    if (!current) return;
    await withOptimistic(
      current,
      { ...current, progreso },
      v => resource.setData(v),
      () => api.update(current.id, { progreso }),
    );
  }, [api, resource]);
}

export function useMilestoneToggler(api: ProjectsApi, resource: ReturnType<typeof useProject>) {
  return useCallback(async (milestoneId: string | number) => {
    const current = resource.data;
    if (!current) return;
    const nextHitos = current.hitos.map(h => h.id === milestoneId ? { ...h, completado: !h.completado } : h);
    await withOptimistic(
      current,
      { ...current, hitos: nextHitos },
      v => resource.setData(v),
      () => api.update(current.id, { hitos: nextHitos }),
    );
  }, [api, resource]);
}
