/**
 * LoginPage — email/password form.
 * Delegates everything to AuthStore.signIn; shows inline errors.
 */

import { useState } from "react";
import { Input, Button } from "@/shared/ui";
import { useAuth } from "../hooks/useAuth";

interface Props {
  onSuccess: (role: "admin" | "cliente" | "profesional") => void;
  onBack?:   () => void;
}

export function LoginPage({ onSuccess, onBack }: Props) {
  const { signIn, status, error } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await signIn(email, password);
    if (user) onSuccess(user.rol);
  };

  return (
    <section className="login-page">
    <div className="login-card" style={{ maxWidth: 400, margin: "0 auto", padding: 40, background: "#fffaf4", border: "1px solid #d8c4ad", borderRadius: 12 }}>
      <header style={{ marginBottom: 24, textAlign: "center" }}>
        <div className="login-brand" aria-label="Hogaria Reformas Integrales">
          <img src="/brand/hogaria-isotipo.png" alt="" />
          <img src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" />
        </div>
        <p style={{ fontSize: 12, color: "#71685e", marginTop: 6 }}>Accede a tu cuenta</p>
      </header>

      <form onSubmit={submit} noValidate>
        <Input label="Email" type="email" autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          disabled={status === "authenticating"} />

        <Input label="Contraseña" type="password" autoComplete="current-password" required
          value={password} onChange={e => setPassword(e.target.value)}
          disabled={status === "authenticating"} />

        {error && <p role="alert" style={{ fontSize: 12, color: "#f87171", marginBottom: 14, padding: 8, background: "#f8717108", border: "1px solid #f8717126", borderRadius: 6 }}>{error}</p>}

        <Button type="submit" style={{ width: "100%" }} loading={status === "authenticating"}>
          Iniciar sesión
        </Button>

        {onBack && (
          <Button variant="ghost" onClick={onBack} style={{ width: "100%", marginTop: 10 }} small>
            ← Volver a la página principal
          </Button>
        )}
      </form>

      <p style={{ fontSize: 12, color: "#85786b", textAlign: "center", marginTop: 20 }}>
        ¿Problemas para acceder? Contacta con el administrador
      </p>
    </div>
    </section>
  );
}
