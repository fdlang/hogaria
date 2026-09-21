/**
 * useUserForm — owns form state for creating/editing users.
 * Handles the conditional rules (profesion required for profesional, etc).
 */

import { useState, useEffect, useCallback } from "react";
import { UsersApi, UserDTO, CreateUserPayload } from "../api/users.api";
import { ACCOUNT_PASSWORD_REQUIREMENTS, isValidAccountPassword, isValidSpanishPhone, Profesion } from "@reformapro/domain";

export interface UserFormState {
  email: string;
  nombre: string;
  rol: UserDTO["rol"];
  profesion: Profesion | null;
  telefono: string;
  newPassword?: string;
}

const EMPTY: UserFormState = {
  email: "", nombre: "", rol: "cliente",
  profesion: null, telefono: "", newPassword: "",
};

export type UserFormErrors = Partial<Record<keyof UserFormState, string>>;

export function useUserForm(api: UsersApi, initial: UserDTO | null = null) {
  const [state, setState]     = useState<UserFormState>(EMPTY);
  const [errors, setErrors]   = useState<UserFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) { setState(EMPTY); return; }
    setState({
      email: initial.email, nombre: initial.nombre, rol: initial.rol,
      profesion: (initial.profesion ?? null) as Profesion | null,
      telefono:  initial.telefono ?? "",
      newPassword: "",
    });
  }, [initial]);

  const setField = useCallback(<K extends keyof UserFormState>(k: K, v: UserFormState[K]) => {
    setState(s => ({ ...s, [k]: v }));
    if (errors[k]) setErrors(e => { const { [k]: _, ...rest } = e; return rest; });
  }, [errors]);

  const validate = useCallback((): UserFormErrors => {
    const e: UserFormErrors = {};
    if (!state.nombre.trim()) e.nombre = "Obligatorio";
    if (!state.email.trim())  e.email  = "Obligatorio";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) e.email = "Email inválido";
    if (state.rol === "profesional" && !state.profesion) e.profesion = "Selecciona profesión";
    if (!isValidSpanishPhone(state.telefono)) e.telefono = "Teléfono no válido";
    if (state.newPassword && !isValidAccountPassword(state.newPassword)) e.newPassword = ACCOUNT_PASSWORD_REQUIREMENTS;
    return e;
  }, [state]);

  const submit = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return null; }
    setSubmitting(true); setErrors({});
    try {
      if (initial) {
        return await api.update(initial.id, {
          nombre: state.nombre,
          telefono: state.telefono,
          profesion: state.profesion ?? undefined,
          newPassword: state.newPassword || undefined,
        });
      }
      const payload: CreateUserPayload = {
        email: state.email, nombre: state.nombre, rol: state.rol,
        profesion: state.profesion ?? undefined, telefono: state.telefono,
      };
      return await api.create(payload);
    } finally { setSubmitting(false); }
  }, [api, initial, state, validate]);

  return { state, setField, errors, submitting, submit, validate };
}
