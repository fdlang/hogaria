import { useState } from "react";
import { SolicitudesApi, useSubmitSolicitud } from "../api/solicitudes.api";
import { Input, Textarea, Select, Button } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { PROJECT_TIPOS } from "@reformapro/domain";
import { portfolioServices, portfolioWorks } from "../portfolio.data";

interface Props { api: SolicitudesApi; onLogin: () => void; }
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
    <nav aria-label="Navegación principal"><a className="nav-brand" href="#inicio"><img className="brand-symbol" src="/brand/hogaria-isotipo.png" alt="" /><img className="brand-wordmark" src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" /></a><a href="#obras">Obras</a><a href="#servicios">Servicios</a><a href="#proceso">Proceso</a><a href="#contacto">Contacto</a><button onClick={onLogin}>Área cliente →</button></nav>
    <section className="hero" id="inicio"><div><span className="eyebrow">Hogaria · Madrid</span><h1>Espacios que<br /><em>merece</em> la pena vivir.</h1><p>Reformas e interiorismo con diseño, planificación y ejecución bajo control. Sin sorpresas, con mucho oficio.</p><div className="actions"><Button onClick={() => jump("contacto")}>Cuéntanos tu proyecto →</Button><button onClick={() => jump("obras")}>Ver obras seleccionadas ↓</button></div></div><img className="hero-marble" src="/brand/hogaria-hero.jpg" alt="" width="1920" height="1280" decoding="async" /><span className="stamp"><b>+120</b>hogares<br />transformados</span></section>
    <section id="obras" className="section"><header><span className="eyebrow">Obras seleccionadas</span><h2>El detalle no es<br /><em>un extra.</em></h2><p>Cada espacio parte de una conversación y termina con una casa que funciona mejor.</p></header><div className="works">{portfolioWorks.map(({ title, type, image }) => <article key={title}><img src={image} alt={title} width="1200" height="800" loading="lazy" decoding="async" /><div><small>{type}</small><h3>{title}</h3><button onClick={() => jump("contacto")} aria-label={`Solicitar un proyecto como ${title}`}>↗</button></div></article>)}</div></section>
    <section id="servicios" className="section dark"><header><span className="eyebrow">Lo que hacemos</span><h2>Una reforma,<br /><em>bien pensada.</em></h2></header><div className="services">{portfolioServices.map(({ number, title, description }) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><b>↗</b></article>)}</div></section>
    <section id="proceso" className="case"><img src={portfolioWorks[1].image} alt="Cocina reformada" width="1200" height="800" loading="lazy" decoding="async" /><div><span className="eyebrow">Caso de estudio · Atocha</span><blockquote>“Queríamos una cocina para estar, no solo para cocinar.”</blockquote><p>Replanteamos la distribución, ganamos luz natural y creamos una isla que conecta toda la vida de la casa.</p><div className="metrics"><span><b>48 m²</b>intervenidos</span><span><b>7 semanas</b>de obra</span><span><b>1 equipo</b>de principio a fin</span></div><Button variant="ghost" onClick={() => jump("contacto")}>Quiero algo así →</Button></div></section>
    <section className="testimonial"><span className="eyebrow">Opiniones reales</span><blockquote>“Nos acompañaron en cada decisión y cumplieron cada fecha. La reforma fue sorprendentemente tranquila.”</blockquote><b>Clara y Daniel Moreno</b><small>Reforma integral · Retiro</small></section>
    <section id="contacto" className="contact"><div><span className="eyebrow">Hablemos</span><h2>Tu casa tiene<br /><em>mucho que contar.</em></h2><p>Cuéntanos qué necesitas. Te responderemos con una primera orientación en menos de 24 horas.</p><a href="tel:+34910000000">+34 910 000 000</a><a href="mailto:hola@hogaria.es">hola@hogaria.es</a></div>{done ? <div className="success"><b>✓</b><h3>Solicitud recibida</h3><p>Muy pronto nos pondremos en contacto contigo.</p><Button variant="ghost" onClick={reset}>Enviar otra solicitud</Button></div> : <form onSubmit={send} noValidate><div className="form-row"><Input label="Nombre" required value={form.nombre} error={errors.nombre} onChange={e => setForm(f => ({...f,nombre:e.target.value}))}/><Input label="Email" type="email" required value={form.email} error={errors.email} onChange={e => setForm(f => ({...f,email:e.target.value}))}/></div><Input label="Teléfono" value={form.telefono} onChange={e => setForm(f => ({...f,telefono:e.target.value}))}/><Select label="Tipo de proyecto" required value={form.tipo} onChange={e => setForm(f => ({...f,tipo:e.target.value}))}><option value="">Selecciona una opción</option>{PROJECT_TIPOS.map(t=><option key={t}>{t}</option>)}</Select><Textarea label="Cuéntanos tu idea" rows={4} value={form.descripcion} error={errors.descripcion} onChange={e => setForm(f => ({...f,descripcion:e.target.value}))}/><Button type="submit" loading={submitting} style={{width:"100%"}}>Enviar proyecto →</Button></form>}</section>
    <footer><a href="#inicio">Hogaria</a><p>Reformas e interiorismo con oficio.<br />Madrid · 2026</p><div><a href="#obras">Instagram</a><a href="#contacto">Contacto</a><button onClick={onLogin}>Área cliente</button></div></footer>
  </div>;
}
