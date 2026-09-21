import { useEffect, useState } from "react";
import { Button, Input } from "@/shared/ui";
import type { UsersApi } from "@/features/users/api/users.api";
import { activationTokenFromLocation } from "../activation-token";
import { ACCOUNT_PASSWORD_REQUIREMENTS, isValidAccountPassword } from "@reformapro/domain";

export function ActivateAccountPage({ api }: { api: UsersApi }) {
  const [token] = useState(() => {
    const fromLink = activationTokenFromLocation(window.location);
    if (fromLink) sessionStorage.setItem(ACTIVATION_TOKEN_KEY, fromLink);
    return fromLink || sessionStorage.getItem(ACTIVATION_TOKEN_KEY);
  });
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  useEffect(() => {
    if (token) {
      window.history.replaceState(window.history.state, "", "/#/activar-cuenta");
    }
  }, [token]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(""); if (!token) return; if (!isValidAccountPassword(password)) return setError(`${ACCOUNT_PASSWORD_REQUIREMENTS}.`); if (password !== confirm) return setError("Las contraseñas no coinciden."); try { setSaving(true); await api.activateAccount(token, password); sessionStorage.removeItem(ACTIVATION_TOKEN_KEY); setDone(true); } catch (cause) { setError((cause as { message?: string } | null)?.message ?? "No se pudo activar la cuenta."); } finally { setSaving(false); } };
  return <section className="login-page"><div className="login-card" style={{ maxWidth:440, margin:"0 auto", padding:40, background:"#fffaf4", border:"1px solid #d8c4ad", borderRadius:12 }}><img src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" style={{ display:"block", width:190, margin:"0 auto 28px" }} />{done ? <><h1>Cuenta activada</h1><p>Tu contraseña se ha creado correctamente. Ya puedes acceder a tu área privada.</p><Button onClick={() => { window.location.hash = "#/login"; }}>Iniciar sesión</Button></> : !token ? <><h1>Enlace no válido</h1><p role="alert">Este enlace no contiene una invitación válida. Solicita un nuevo acceso al administrador.</p><Button onClick={() => { window.location.hash = "#/login"; }}>Volver al acceso</Button></> : <form onSubmit={submit}><h1>Activa tu cuenta</h1><p style={{ color:"#71685e" }}>Crea una contraseña segura para acceder a tu área privada.</p>{error && <p role="alert" style={{ color:"#a43c32" }}>{error}</p>}<Input label="Nueva contraseña" type="password" required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /><p style={{ color:"#71685e", fontSize:12 }}>{ACCOUNT_PASSWORD_REQUIREMENTS}.</p><Input label="Repite la contraseña" type="password" required autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /><Button type="submit" loading={saving}>Activar cuenta</Button></form>}</div></section>;
}

const ACTIVATION_TOKEN_KEY = "hogaria_activation_token";
