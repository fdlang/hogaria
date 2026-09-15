/**
 * PublicLanding — landing pública con hero + formulario de contacto.
 * Endpoint sin auth; rate-limited en servidor (3/hora por IP).
 */

import { useState } from "react";
import { SolicitudesApi, useSubmitSolicitud } from "../api/solicitudes.api";
import { Input, Textarea, Select, Button } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { PROJECT_TIPOS } from "@reformapro/domain";

interface Props {
  api: SolicitudesApi;
  onLogin: () => void;
}

export function PublicLanding({ api, onLogin }: Props) {
  const { submit, submitting, done, reset } = useSubmitSolicitud(api);
  const { push } = useNotifications();

  const [form, setForm] = useState({
    nombre: "", email: "", telefono: "", tipo: "", descripcion: "",
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Partial<typeof form> = {};
    if (!form.nombre.trim()) errs.nombre = "Obligatorio";
    if (!form.email.trim())  errs.email  = "Obligatorio";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Email inválido";
    if (!form.tipo)          errs.tipo = "Selecciona tipo";
    if (form.descripcion.length < 20) errs.descripcion = "Mínimo 20 caracteres";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      await submit(form);
      push("Solicitud enviada. Te contactaremos en menos de 24h.", "success");
      setForm({ nombre: "", email: "", telefono: "", tipo: "", descripcion: "" });
    } catch { /* handled by hook */ }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Hero */}
      <section style={{ padding: "60px 0", textAlign: "center" }}>
        <h1 style={{ fontSize: 54, fontWeight: 700, color: "#f0ede6", lineHeight: 1.05, marginBottom: 20 }}>
          Reformas <span style={{ color: "#c8a96e" }}>sin sorpresas</span>
        </h1>
        <p style={{ fontSize: 17, color: "#666", maxWidth: 620, margin: "0 auto 30px" }}>
          Plataforma de gestión integral para reformas en Madrid.
          Presupuestos transparentes, profesionales verificados y seguimiento en tiempo real.
        </p>
        <Button onClick={onLogin}>Acceder a mi cuenta →</Button>
      </section>

      {/* Done state */}
      {done ? (
        <section style={{ padding: 40, background: "#34d39908", border: "1px solid #34d399", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 40, color: "#34d399" }}>✓</div>
          <h2 style={{ fontSize: 22, color: "#f0ede6", marginTop: 12 }}>Solicitud recibida</h2>
          <p style={{ color: "#666", marginTop: 8 }}>Revisaremos tu caso y te contactaremos en menos de 24h.</p>
          <Button small variant="ghost" onClick={reset} style={{ marginTop: 20 }}>Enviar otra solicitud</Button>
        </section>
      ) : (
        <section id="contacto" style={{ padding: 40, background: "#141411", border: "1px solid #2a2a26", borderRadius: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "#f0ede6", marginBottom: 8 }}>Cuéntanos tu proyecto</h2>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
            Te enviaremos un primer presupuesto orientativo en 24h. Sin compromiso.
          </p>

          <form onSubmit={onSubmit} noValidate>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Nombre" required
                value={form.nombre} error={errors.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              <Input label="Email" type="email" required
                value={form.email} error={errors.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Teléfono"
                value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              <Select label="Tipo de reforma" required
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="">— Selecciona —</option>
                {PROJECT_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            {errors.tipo && <p role="alert" style={{ fontSize: 11, color: "#f87171", marginTop: -10, marginBottom: 10 }}>{errors.tipo}</p>}

            <Textarea label="Descripción del proyecto" rows={5} required
              placeholder="Metros cuadrados, ubicación, plazos, estilo deseado…"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            {errors.descripcion && <p role="alert" style={{ fontSize: 11, color: "#f87171", marginTop: -10, marginBottom: 10 }}>{errors.descripcion}</p>}

            <Button type="submit" loading={submitting} style={{ width: "100%", marginTop: 10 }}>
              Enviar solicitud
            </Button>
            <p style={{ fontSize: 10, color: "#444", textAlign: "center", marginTop: 8 }}>
              Al enviar aceptas nuestra política de privacidad (RGPD).
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
