# Despliegue en Vercel

Este repositorio se despliega como un único proyecto: Vite genera la SPA y la
función `api/index.ts` sirve la API en el mismo dominio bajo `/api`.

## Configuración

1. Importa el repositorio en Vercel con la raíz del repositorio, no `apps/web`.
2. Vercel leerá `vercel.json`, instalará los workspaces y ejecutará el build de
   `@reformapro/web`. En Production, el build valida las variables críticas y
   falla antes de sustituir la versión estable si falta alguna.
3. Crea una base PostgreSQL gestionada y aplica la migración antes de publicar:
   `npm run db:migrate --workspace @reformapro/api`.

   El runner principal aplica de forma idempotente el esquema base y todas las
   ampliaciones incluidas en el repositorio.
   A continuación ejecuta `npm run preflight:production`: esta comprobación es
   de solo lectura y bloquea el despliegue si faltan migraciones, las sumas de
   control no coinciden o hay firmas históricas sin una clave verificable.
   Si los secretos están protegidos exclusivamente en Vercel, usa
   `npm run preflight:database`; comprueba Neon en modo de solo lectura y deja
   la validación de secretos a la barrera del build de Production.
4. Configura estas variables para Preview y Production:

   - `DATABASE_URL`: URL de PostgreSQL gestionado.
   - `RESEND_API_KEY`: clave API de Resend para invitaciones de cuentas.
   - `EMAIL_FROM`: remitente verificado, por ejemplo `Hogaria <info@hogaria.design>`.
   - `APP_URL`: `https://www.hogaria.design`.
   - `HMAC_SECRET`: secreto aleatorio de al menos 32 caracteres, exclusivo para sesiones.
   - `SIGNATURE_HMAC_SECRET`: secreto distinto para firmas, de al menos 32 caracteres.
   - `SIGNATURE_HMAC_KEY_ID`: identificador de la clave de firma activa (por ejemplo, `sig-2026-09`).
   - `SIGNATURE_HMAC_PREVIOUS_KEYS`: objeto JSON con claves v3 anteriores que
     todavía deban verificar firmas históricas.
   - `SIGNATURE_HMAC_LEGACY_V2_SECRET`: si existen sellos v2, copia aquí el antiguo `HMAC_SECRET` y rota simultáneamente `HMAC_SECRET`; la rotación cierra las sesiones actuales y deja ambas claves separadas.
   - `SIGNATURE_HMAC_LEGACY_V2_USE_SESSION_KEY`: alternativa temporal con valor `true` si el secreto anterior está oculto y no puede copiarse. Solo verifica sellos v2 existentes; las firmas nuevas usan la clave v3 independiente.
   - `ALLOWED_ORIGINS`: dominios adicionales autorizados, separados por comas.
     El dominio del propio despliegue se admite automáticamente.
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`: opcionales,
     sólo para crear el primer administrador.
   - `VITE_API_URL`: opcional. Déjalo vacío para usar `/api` en el mismo dominio.
   - `BLOB_READ_WRITE_TOKEN`: obligatorio para documentos privados.
   - `CLIENT_NOTIFICATIONS_ENABLED`: `true` para activar el correo de los avisos por rol; la campana no depende de este interruptor.
   - `CRON_SECRET`: secreto aleatorio de al menos 32 caracteres usado por el cron de Vercel.
   - `NOTIFICATION_RETRY_SECRET`: secreto alternativo de al menos 32 caracteres, distinto del cron, si se usa el workflow de GitHub.
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

Antes de activar el correo de los avisos, configura Resend, `APP_URL` con HTTPS y
el secreto del cron; después establece `CLIENT_NOTIFICATIONS_ENABLED=true`.
Los presupuestos solo se descargan: los avisos no adjuntan PDF. El cron
reintenta de forma independiente los eventos y correos pendientes.

## Publicación y verificación

La integración Git de Vercel publica `main` en Production. Antes del push deben
pasar `npm run typecheck`, `npm run test`, `npm run build` y las pruebas de
navegador del frontend. Tras el push, comprueba que el despliegue esté `Ready`,
que los alias `hogaria.design` y `www.hogaria.design` apunten a esa versión y
realiza una comprobación funcional de landing, acceso y una ruta `/api`.

## Garantías incluidas

- Las rutas `/api/*` se envían a la función serverless.
- Las rutas de la SPA se reescriben a `index.html`.
- Producción falla al arrancar si faltan PostgreSQL o el secreto HMAC.
- No se inicia un proceso HTTP persistente dentro de Vercel.
- Cabeceras básicas de protección se aplican al despliegue.

Los archivos binarios usan Vercel Blob privado. Sin `BLOB_READ_WRITE_TOKEN`, las
cargas y descargas privadas deben considerarse no disponibles.
