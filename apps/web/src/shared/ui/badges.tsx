/**
 * StatusBadge / RoleBadge — small display components that encapsulate
 * the label+color lookup. Duplicated-in-the-original-code kind of thing.
 */

import { Badge } from "@/shared/ui";
import {
  PROJECT_ESTADOS, ProjectEstadoKey,
  USER_ROLES,
  PROFESIONES, Profesion,
} from "@reformapro/domain";

export function ProjectStatusBadge({ estado }: { estado: ProjectEstadoKey }) {
  const info = PROJECT_ESTADOS[estado];
  return <Badge color={info.color}>{info.label}</Badge>;
}

export function RoleBadge({ rol }: { rol: "admin" | "cliente" | "profesional" }) {
  const info = USER_ROLES[rol];
  return <Badge color={info.color}>{info.icon} {info.label}</Badge>;
}

export function ProfesionBadge({ profesion }: { profesion: Profesion }) {
  const info = PROFESIONES[profesion];
  if (!info) return null;
  return <Badge color={info.color}>{info.icon} {info.label}</Badge>;
}
