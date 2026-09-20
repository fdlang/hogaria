# Despliegue en Vercel

Este repositorio se despliega como un único proyecto: Vite genera la SPA y la
función `api/index.ts` sirve la API en el mismo dominio bajo `/api`.

## Configuración

1. Importa el repositorio en Vercel con la raíz del repositorio, no `apps/web`.
2. Vercel leerá `vercel.json`, instalará los workspaces y ejecutará el build de
   `@reformapro/web`.
3. Crea una base PostgreSQL gestionada y aplica la migración antes de publicar:
   `npm run db:migrate --workspace @reformapro/api`.

   El runner principal aplica de forma idempotente el esquema base y todas las
   ampliaciones incluidas en el repositorio.
4. Configura estas variables para Preview y Production:

   - `DATABASE_URL`: URL de PostgreSQL gestionado.
   - `RESEND_API_KEY`: clave API de Resend para invitaciones de cuentas.
   - `EMAIL_FROM`: remitente verificado, por ejemplo `Hogaria <info@hogaria.design>`.
   - `APP_URL`: `https://www.hogaria.design`.
   - `HMAC_SECRET`: secreto aleatorio de al menos 32 caracteres.
   - `ALLOWED_ORIGINS`: dominios adicionales autorizados, separados por comas.
     El dominio del propio despliegue se admite automáticamente.
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`: opcionales,
     sólo para crear el primer administrador.
   - `VITE_API_URL`: opcional. Déjalo vacío para usar `/api` en el mismo dominio.
   - `BLOB_READ_WRITE_TOKEN`: obligatorio para documentos privados.
   - `CLIENT_NOTIFICATIONS_ENABLED`: `true` para activar avisos de cuenta.
   - `CRON_SECRET`: secreto aleatorio usado por el cron de Vercel.
   - `NOTIFICATION_RETRY_SECRET`: secreto alternativo si se usa el workflow de GitHub.
   - `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_AUTOREPLY_TEMPLATE_ID` y
     `VITE_EMAILJS_PUBLIC_KEY`: opcionales. Habilitan el email de confirmación
     de EmailJS tras registrar una solicitud. La clave pública puede estar en
     el frontend; no añadas contraseñas de correo ni claves privadas.

## Activar jornadas y costes

Ejecuta la migración principal primero en una rama de prueba de Neon y después,
con copia verificada, en la base objetivo. Despliega API y web juntas, configura
las tarifas históricas por profesional y comprueba entrada, pausa, salida,
aprobación y costes con cuentas de prueba. No borres datos históricos para
repetir la migración.

Antes de activar los avisos de cuenta, configura Resend, `APP_URL` con HTTPS y
el secreto del cron; después establece `CLIENT_NOTIFICATIONS_ENABLED=true`.
Los presupuestos solo se descargan: los avisos no adjuntan PDF. El cron diario
reintenta los avisos pendientes.

## Garantías incluidas

- Las rutas `/api/*` se envían a la función serverless.
- Las rutas de la SPA se reescriben a `index.html`.
- Producción falla al arrancar si faltan PostgreSQL o el secreto HMAC.
- No se inicia un proceso HTTP persistente dentro de Vercel.
- Cabeceras básicas de protección se aplican al despliegue.

Los archivos binarios requieren un proveedor de objetos (por ejemplo Vercel Blob
o S3) antes de habilitar cargas reales en producción.
