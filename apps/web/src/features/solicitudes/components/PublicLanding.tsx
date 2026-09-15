import { useState } from "react";
import { SolicitudesApi, useSubmitSolicitud } from "../api/solicitudes.api";
import { Input, Textarea, Select, Button } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { PROJECT_TIPOS } from "@reformapro/domain";

interface Props { api: SolicitudesApi; onLogin: () => void; }
const works = [
  ["Casa de la Luz", "Reforma integral · Chamberí", "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85"],
  ["Cocina Atocha", "Cocina · Madrid centro", "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85"],
  ["Baño Olivar", "Baño · Lavapiés", "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=85"],
  ["Ático Retiro", "Interiorismo · Retiro", "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85"],
] as const;
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

export function PublicLanding({ api, onLogin }: Props) {
  const { submit, submitting, done, reset } = useSubmitSolicitud(api);
  const { push } = useNotifications();
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", tipo: "", descripcion: "" });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); const next: Partial<typeof form> = {};
    if (!form.nombre.trim()) next.nombre = "Obligatorio";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Introduce un email válido";
    if (!form.tipo) next.tipo = "Selecciona un proyecto";
    if (form.descripcion.trim().length < 20) next.descripcion = "Mínimo 20 caracteres";
    setErrors(next); if (Object.keys(next).length) return;
    try { await submit(form); push("Solicitud enviada. Te contactaremos en menos de 24h.", "success"); setForm({ nombre: "", email: "", telefono: "", tipo: "", descripcion: "" }); } catch {}
  };
  return <div className="portfolio">
    <nav><a className="nav-brand" href="#inicio">Reforma<span>Pro</span></a><a href="#obras">Obras</a><a href="#servicios">Servicios</a><a href="#proceso">Proceso</a><a href="#contacto">Contacto</a><button onClick={onLogin}>Área cliente →</button></nav>
    <section className="hero" id="inicio"><div><span className="eyebrow">ReformaPro · Madrid</span><h1>Espacios que<br /><em>merece</em> la pena vivir.</h1><p>Reformas e interiorismo con diseño, planificación y ejecución bajo control. Sin sorpresas, con mucho oficio.</p><div className="actions"><Button onClick={() => jump("contacto")}>Cuéntanos tu proyecto →</Button><button onClick={() => jump("obras")}>Ver obras seleccionadas ↓</button></div></div><img src={works[0][2]} alt="Salón luminoso reformado" /><span className="stamp"><b>+120</b>hogares<br />transformados</span></section>
    <section id="obras" className="section"><header><span className="eyebrow">Obras seleccionadas</span><h2>El detalle no es<br /><em>un extra.</em></h2><p>Cada espacio parte de una conversación y termina con una casa que funciona mejor.</p></header><div className="works">{works.map(([title, type, image]) => <article key={title}><img src={image} alt={title} loading="lazy" /><div><small>{type}</small><h3>{title}</h3><button onClick={() => jump("contacto")}>↗</button></div></article>)}</div></section>
    <section id="servicios" className="section dark"><header><span className="eyebrow">Lo que hacemos</span><h2>Una reforma,<br /><em>bien pensada.</em></h2></header><div className="services">{[["01","Reforma integral","Diseño, obra y entrega con un único equipo responsable."],["02","Cocinas y baños","Distribución inteligente, materiales duraderos y acabados precisos."],["03","Interiorismo","Espacios que encajan con tu forma de vivir."]].map(([n,t,p]) => <article key={n}><span>{n}</span><div><h3>{t}</h3><p>{p}</p></div><b>↗</b></article>)}</div></section>
    <section id="proceso" className="case"><img src={works[1][2]} alt="Cocina reformada" loading="lazy" /><div><span className="eyebrow">Caso de estudio · Atocha</span><blockquote>“Queríamos una cocina para estar, no solo para cocinar.”</blockquote><p>Replanteamos la distribución, ganamos luz natural y creamos una isla que conecta toda la vida de la casa.</p><div className="metrics"><span><b>48 m²</b>intervenidos</span><span><b>7 semanas</b>de obra</span><span><b>1 equipo</b>de principio a fin</span></div><Button variant="ghost" onClick={() => jump("contacto")}>Quiero algo así →</Button></div></section>
    <section className="testimonial"><span className="eyebrow">Opiniones reales</span><blockquote>“Nos acompañaron en cada decisión y cumplieron cada fecha. La reforma fue sorprendentemente tranquila.”</blockquote><b>Clara y Daniel Moreno</b><small>Reforma integral · Retiro</small></section>
    <section id="contacto" className="contact"><div><span className="eyebrow">Hablemos</span><h2>Tu casa tiene<br /><em>mucho que contar.</em></h2><p>Cuéntanos qué necesitas. Te responderemos con una primera orientación en menos de 24 horas.</p><a href="tel:+34910000000">+34 910 000 000</a><a href="mailto:hola@reformapro.es">hola@reformapro.es</a></div>{done ? <div className="success"><b>✓</b><h3>Solicitud recibida</h3><p>Muy pronto nos pondremos en contacto contigo.</p><Button variant="ghost" onClick={reset}>Enviar otra solicitud</Button></div> : <form onSubmit={send} noValidate><div className="form-row"><Input label="Nombre" required value={form.nombre} error={errors.nombre} onChange={e => setForm(f => ({...f,nombre:e.target.value}))}/><Input label="Email" type="email" required value={form.email} error={errors.email} onChange={e => setForm(f => ({...f,email:e.target.value}))}/></div><Input label="Teléfono" value={form.telefono} onChange={e => setForm(f => ({...f,telefono:e.target.value}))}/><Select label="Tipo de proyecto" required value={form.tipo} onChange={e => setForm(f => ({...f,tipo:e.target.value}))}><option value="">Selecciona una opción</option>{PROJECT_TIPOS.map(t=><option key={t}>{t}</option>)}</Select><Textarea label="Cuéntanos tu idea" rows={4} value={form.descripcion} error={errors.descripcion} onChange={e => setForm(f => ({...f,descripcion:e.target.value}))}/><Button type="submit" loading={submitting} style={{width:"100%"}}>Enviar proyecto →</Button></form>}</section>
    <footer><a href="#inicio">Reforma<span>Pro</span></a><p>Reformas e interiorismo con oficio.<br />Madrid · 2026</p><div><a href="#obras">Instagram</a><a href="#contacto">Contacto</a><button onClick={onLogin}>Área cliente</button></div></footer>
  </div>;
}
