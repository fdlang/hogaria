import { useEffect, useState } from "react";
import { Button, Input } from "@/shared/ui";
import type { UsersApi } from "@/features/users/api/users.api";
import { activationTokenFromLocation } from "../activation-token";
import { ACCOUNT_PASSWORD_REQUIREMENTS, isValidAccountPassword } from "@reformapro/domain";

const ACTIVATION_TOKEN_KEY = "hogaria_activation_token";

export function ActivateAccountPage({ api }: { api: UsersApi }) {
  const [token, setToken] = useState<string | null>(() => {
    const fromLink = activationTokenFromLocation(window.location);
    if (fromLink) sessionStorage.setItem(ACTIVATION_TOKEN_KEY, fromLink);
    return fromLink || sessionStorage.getItem(ACTIVATION_TOKEN_KEY);
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(window.history.state, "", "/#/activar-cuenta");
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) return;
    if (!isValidAccountPassword(password)) {
      setError(`${ACCOUNT_PASSWORD_REQUIREMENTS}.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    try {
      setSaving(true);
      await api.activateAccount(token, password);
      sessionStorage.removeItem(ACTIVATION_TOKEN_KEY);
      setDone(true);
    } catch (cause) {
      const error = cause as { status?: number; field?: string; message?: string } | null;
      if (error?.status === 409 || error?.field === "token") {
        sessionStorage.removeItem(ACTIVATION_TOKEN_KEY);
        setToken(null);
      }
      setError(error?.message ?? "No se pudo activar la cuenta.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="login-page">
    <div className="login-card" style={{ maxWidth: 440, margin: "0 auto", padding: 40, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 12 }}>
      <img src="/brand/hogaria-wordmark-480.png" alt="Hogaria Reformas Integrales" width="480" height="104" style={{ display: "block", width: 190, height: "auto", margin: "0 auto 28px" }} />
      {done ? <>
        <h1>Contraseña creada</h1>
        <p>Tu nueva contraseña se ha guardado correctamente. Ya puedes acceder a tu área privada.</p>
        <Button onClick={() => { window.location.hash = "#/login"; }}>Iniciar sesión</Button>
      </> : !token ? <>
        <h1>Enlace no válido</h1>
        <p role="alert">Este enlace no es válido o ya no está disponible. Solicita uno nuevo al administrador.</p>
        <Button onClick={() => { window.location.hash = "#/login"; }}>Volver al acceso</Button>
      </> : <form onSubmit={submit}>
        <h1>Crea tu contraseña</h1>
        <p style={{ color: "#71685e" }}>Define una contraseña segura para acceder a tu área privada.</p>
        {error && <p id="activation-error" role="alert" style={{ color: "#a43c32" }}>{error}</p>}
        <Input label="Nueva contraseña" type="password" required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} aria-describedby={error ? "activation-error" : undefined} />
        <p style={{ color: "#71685e", fontSize: 12 }}>{ACCOUNT_PASSWORD_REQUIREMENTS}.</p>
        <Input label="Repite la contraseña" type="password" required autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} aria-describedby={error ? "activation-error" : undefined} />
        <Button type="submit" loading={saving}>Guardar contraseña</Button>
      </form>}
      <p style={{ marginTop: 20, fontSize: 12, textAlign: "center" }}><a href="#/privacidad">Información sobre privacidad</a></p>
    </div>
  </section>;
}
