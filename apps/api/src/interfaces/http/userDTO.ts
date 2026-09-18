import type { User } from "@reformapro/domain/entities";

/** Stable HTTP representation of a user. Never expose domain value objects. */
export function toUserDTO(user: User) {
  return {
    id: user.id,
    email: user.email.value,
    nombre: user.nombre,
    rol: user.rol,
    profesion: user.profesion ?? null,
    telefono: user.telefono ?? null,
    activo: user.activo,
    createdAt: user.createdAt.toISOString(),
  };
}
