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
  const [formError, setFormError] = useState<string | null>(null);
  const visibleError = error ?? formError;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError("Introduce tu email y contraseña para continuar.");
      return;
    }

    try {
      const user = await signIn(email.trim(), password);
      if (user) onSuccess(user.rol);
      else setFormError("No se ha podido iniciar sesión. Revisa tus datos e inténtalo de nuevo.");
    } catch {
      // AuthStore normally handles transport failures. Keep an independent
      // UI fallback so the form can never fail without feedback.
      setFormError("No se ha podido contactar con el área privada. Inténtalo de nuevo en unos segundos.");
    }
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
          value={email} onChange={e => { setEmail(e.target.value); setFormError(null); }}
          aria-invalid={visibleError ? true : undefined}
          disabled={status === "authenticating"} />

        <Input label="Contraseña" type="password" autoComplete="current-password" required
          value={password} onChange={e => { setPassword(e.target.value); setFormError(null); }}
          aria-invalid={visibleError ? true : undefined}
          disabled={status === "authenticating"} />

        {visibleError && <p role="alert" aria-live="assertive" style={{ fontSize: 14, fontWeight: 600, color: "#9c342c", marginBottom: 14, padding: "11px 12px", background: "#fce9e5", border: "1px solid #d66a5e", borderRadius: 8 }}>{visibleError}</p>}

        {status === "authenticating" && <p aria-live="polite" style={{ fontSize: 13, color: "#71685e", marginBottom: 12 }}>Comprobando credenciales…</p>}

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
