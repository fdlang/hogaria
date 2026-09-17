import { useEffect, useRef, useState } from "react";
import { send as sendEmail } from "@emailjs/browser";
import { SolicitudesApi, useSubmitSolicitud } from "../api/solicitudes.api";
import { Input, Textarea, Select, Button } from "@/shared/ui";
import { useNotifications } from "@/shared/ui/notifications";
import { PROJECT_TIPOS } from "@reformapro/domain";
import { portfolioServices, portfolioWorks } from "../portfolio.data";

interface Props { api: SolicitudesApi; onLogin: () => void; }
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

const emailJsConfig = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
  templateId: import.meta.env.VITE_EMAILJS_AUTOREPLY_TEMPLATE_ID,
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
};

/**
 * The API is the source of truth for a contact request. EmailJS is best-effort:
 * an email provider failure must never prevent the request from being saved.
 */
function sendAutomaticReply(form: { nombre: string; email: string; telefono: string; tipo: string; descripcion: string }) {
  const { serviceId, templateId, publicKey } = emailJsConfig;
  if (!serviceId || !templateId || !publicKey) return Promise.resolve();

  return sendEmail(serviceId, templateId, {
    nombre: form.nombre,
    email: form.email,
    telefono: form.telefono,
    tipo: form.tipo,
    descripcion: form.descripcion,
  }, { publicKey });
}

function FeaturedBathroom() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.6) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }, { threshold: [0, 0.6] });

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="proceso" className="project-showcase" aria-labelledby="bano-pinto-title">
      <div className="project-showcase__intro">
        <span className="eyebrow">Duplex Pinto · Reforma integral · BaÑo 5,08 m²</span>
        <h2 id="bano-pinto-title"><span className="project-showcase__title-line">Un baño compacto,</span><br />diseñado para <em>compartir.</em></h2>
        <p>El baño original tenía bañera, poca iluminación y una distribución que dificultaba su uso diario. El espacio no permitía que dos personas se preparasen cómodamente al mismo tiempo.</p>
      </div>

      <figure className="project-showcase__image">
        <img src="/images/portfolio/bano-pinto.jpg" alt="Baño Pinto reformado con mueble de madera, espejo iluminado y ducha amplia" width="3024" height="4032" loading="lazy" decoding="async" />
      </figure>

      <div className="project-showcase__story">
        <div>
          <span className="eyebrow">La intervención</span>
          <p>Replanteamos la distribución para incorporar una ducha amplia con mampara transparente, inodoro empotrado y una hornacina iluminada. Ganamos circulación, almacenaje y una sensación de amplitud real.</p>
        </div>
        <div>
          <span className="eyebrow">El resultado</span>
          <p>Un espacio luminoso, funcional y sereno, preparado para que dos personas lo utilicen con comodidad.</p>
        </div>
      </div>

      <div className="project-showcase__materials">
        <span className="eyebrow">Materiales y detalle</span>
        <h3>Materiales elegidos para durar.</h3>
        <p>Porcelánico de gran formato 120 × 60 cm para reducir juntas y dar continuidad visual. Mueble en acabado madera, espejo retroiluminado, mampara de vidrio y grifería de calidad para crear un baño cálido, duradero y fácil de mantener.</p>
      </div>

      <div className="project-showcase__video">
        <div className="project-showcase__video-frame">
          <video ref={videoRef} controls muted={muted} loop preload="metadata" playsInline poster="/images/portfolio/bano-pinto-detalle.jpg" aria-label="Recorrido por el Baño Pinto reformado">
            <source src="/images/portfolio/bano-pinto.mp4" type="video/mp4" />
            Tu navegador no puede reproducir este vídeo.
          </video>
          <button className="project-showcase__sound" type="button" aria-pressed={!muted} onClick={() => {
            setMuted(value => !value);
            void videoRef.current?.play().catch(() => undefined);
          }}>
            {muted ? "🔇 Activar sonido" : "🔊 Silenciar"}
          </button>
        </div>
        <p>Recorrido por el resultado final.</p>
      </div>

      <div className="project-showcase__cta">
        <p>¿Quieres transformar tu baño?</p>
        <Button onClick={() => jump("contacto")}>Hablar de mi proyecto</Button>
      </div>
    </section>
  );
}

export function PublicLanding({ api, onLogin }: Props) {
  const { submit, submitting, done, reset } = useSubmitSolicitud(api);
  const { push } = useNotifications();
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", tipo: "", descripcion: "" });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); const next: Partial<typeof form> = {};
    if (!form.nombre.trim()) next.nombre = "Obligatorio";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Introduce un email válido";
    const phone = form.telefono.replace(/[\s().-]/g, "");
    if (phone && !/^(?:(?:\+|00)34)?[6789]\d{8}$/.test(phone)) {
      next.telefono = "Introduce un teléfono español válido";
    }
    if (!form.tipo) next.tipo = "Selecciona un proyecto";
    if (form.descripcion.trim().length < 20) next.descripcion = "Mínimo 20 caracteres";
    setErrors(next); if (Object.keys(next).length) return;
    try {
      await submit(form);
      void sendAutomaticReply(form).catch(() => undefined);
      push("Solicitud enviada correctamente. Te contactaremos en menos de 24 h.", "success");
      setForm({ nombre: "", email: "", telefono: "", tipo: "", descripcion: "" });
      setErrors({});
    } catch {
      push("No hemos podido enviar tu solicitud. Comprueba tu conexión e inténtalo de nuevo.", "error");
    }
  };
  return <div className="portfolio">
    <nav aria-label="Navegación principal"><a className="nav-brand" href="#inicio"><img className="brand-symbol" src="/brand/hogaria-isotipo.png" alt="" /><img className="brand-wordmark" src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" /></a><div className="nav-links"><a href="#obras">Obras</a><a href="#servicios">Servicios</a><a href="#proceso">Proyecto</a><a href="#contacto">Contacto</a></div></nav>
    <section className="hero" id="inicio"><div><span className="eyebrow">Hogaria · Madrid</span><h1>Tu casa,<br /><em>mejor pensada.</em></h1><p>Reformas integrales e interiorismo en Madrid. Diseñamos espacios funcionales, luminosos y hechos para tu día a día.</p><div className="actions"><Button onClick={() => jump("contacto")}>Cuéntanos tu proyecto</Button><button onClick={() => jump("obras")}>Ver obras seleccionadas</button></div></div><img className="hero-marble" src="/brand/hogaria-hero.jpg" alt="" width="1920" height="1280" decoding="async" /></section>
    <section id="obras" className="section"><header><span className="eyebrow">Obras seleccionadas</span><h2>El detalle no es<br /><em>un extra.</em></h2><p>Una selección de reformas donde distribución, materiales y luz trabajan como un conjunto.</p></header><div className="works">{portfolioWorks.map(({ title, type, image }) => {
      const isDuplexPintoCase = title === "Duplex Pinto";
      return <article key={title}><img src={image} alt={title} width="1200" height="800" loading="lazy" decoding="async" /><div><small>{type}</small><h3>{title}</h3><button className="works__action" onClick={() => jump(isDuplexPintoCase ? "proceso" : "contacto")} aria-label={isDuplexPintoCase ? "Ver el caso de estudio Duplex Pinto" : `Solicitar un proyecto como ${title}`}>{isDuplexPintoCase ? "Ver proyecto" : "Hablar del proyecto"}</button></div></article>;
    })}</div></section>
    <section id="servicios" className="section dark">
      <header>
        <div><span className="eyebrow">Lo que hacemos</span><h2>Todo lo que<br />tu casa <em>necesita.</em></h2></div>
        <p>Intervenimos en todos los espacios de la vivienda para que funcionen como un conjunto.</p>
      </header>
      <div className="services">{portfolioServices.map(({ number, title, description }) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      <div className="services-cta"><div><span className="eyebrow">Hablemos de tu vivienda</span><h3>¿No sabes por dónde empezar?</h3><p>Cuéntanos tu idea y te orientaremos sobre el alcance de tu reforma.</p></div><Button onClick={() => jump("contacto")}>Hablar de mi proyecto</Button></div>
    </section>
    <FeaturedBathroom />
    <section className="testimonial"><span className="eyebrow">Hogaria</span><blockquote>“Una reforma bien hecha se nota cada día.”</blockquote><p>Cada decisión debe responder a una necesidad real.</p></section>
    <section id="contacto" className="contact">
      <div>
        <span className="eyebrow">Hablemos</span>
        <h2>Empecemos<br /><span className="contact-title__project">por <em>tu proyecto.</em></span></h2>
        <p>Cuéntanos qué quieres transformar. Revisaremos tu idea y te indicaremos los siguientes pasos.</p>
        <a href="tel:+34614786341">+34 614 786 341</a>
        <a href="mailto:info@hogaria.design">info@hogaria.design</a>
      </div>
      {done ? <div className="success"><b aria-hidden="true">✓</b><h3>Solicitud recibida</h3><p>Estamos revisando tu proyecto y te contactaremos muy pronto.</p><Button variant="ghost" onClick={reset}>Enviar otra solicitud</Button></div> : <form onSubmit={send} noValidate><div className="form-row"><Input label="Nombre" required value={form.nombre} error={errors.nombre} onChange={e => setForm(f => ({...f,nombre:e.target.value}))}/><Input label="Email" type="email" required value={form.email} error={errors.email} onChange={e => setForm(f => ({...f,email:e.target.value}))}/></div><Input label="Teléfono" type="tel" inputMode="tel" autoComplete="tel" placeholder="614 786 341" value={form.telefono} error={errors.telefono} onChange={e => setForm(f => ({...f,telefono:e.target.value}))}/><Select label="Tipo de proyecto" required value={form.tipo} onChange={e => setForm(f => ({...f,tipo:e.target.value}))}><option value="">Selecciona una opción</option>{PROJECT_TIPOS.map(t=><option key={t}>{t}</option>)}</Select><Textarea label="Cuéntanos tu idea" rows={4} value={form.descripcion} error={errors.descripcion} onChange={e => setForm(f => ({...f,descripcion:e.target.value}))}/><Button type="submit" loading={submitting} style={{width:"100%"}}>Enviar proyecto</Button></form>}
    </section>
    <footer><a className="footer-brand" href="#inicio" aria-label="Hogaria, volver al inicio"><img src="/brand/hogaria-isotipo.png" alt="" /><img src="/brand/hogaria-wordmark.png" alt="Hogaria Reformas Integrales" /></a><p>Reformas integrales e interiorismo.<br />Madrid · 2026</p><div><a className="footer-instagram" href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram de Hogaria"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a><a href="#contacto">Contacto</a><button onClick={onLogin}>Área cliente</button></div></footer>
  </div>;
}
