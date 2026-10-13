import "./maintenance.css";

export function MaintenancePage() {
  return (
    <main className="maintenance-page">
      <section className="maintenance-card" aria-labelledby="maintenance-title">
        <header className="maintenance-card__header">
          <img
            className="maintenance-card__brand"
            src="/brand/hogaria-wordmark-480.png"
            alt="Hogaria, reformas integrales"
          />
        </header>
        <div className="maintenance-card__content">
          <p className="maintenance-card__eyebrow">Mantenimiento temporal</p>
          <h1 id="maintenance-title">Volvemos enseguida.</h1>
          <p className="maintenance-card__message">
            Estamos realizando una intervención para mantener el servicio en las mejores condiciones.
            Inténtalo de nuevo dentro de unos minutos.
          </p>
          <div className="maintenance-card__actions" aria-label="Opciones">
            <button type="button" onClick={() => window.location.reload()}>
              Volver a intentar
            </button>
            <a href="mailto:info@hogaria.design">Contactar con Hogaria</a>
          </div>
        </div>
      </section>
    </main>
  );
}
