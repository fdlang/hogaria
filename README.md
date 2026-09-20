# Hogaria

Aplicación web para reformas integrales e interiorismo. Incluye una landing
comercial, acceso privado para administración, clientes y profesionales, y una
API con arquitectura por capas y persistencia PostgreSQL.

## Tecnologías

- React 18, TypeScript y Vite.
- Node.js, TypeScript y API HTTP.
- PostgreSQL mediante `pg`.
- Bcrypt para contraseñas.
- Vercel: SPA estática y funciones serverless bajo `/api`.

## Estructura

```text
apps/
  web/                 Frontend React/Vite
  api/                 API, casos de uso e infraestructura
packages/
  domain/              Entidades, reglas de negocio y contratos
api/                   Entrypoints serverless para Vercel
```

El paquete `domain` no depende de React, Node, PostgreSQL ni HTTP. La API
conecta controladores, casos de uso y repositorios en `apps/api/src/bootstrap.ts`.

## Requisitos

- Node.js 24.x.
- npm 9 o superior.
- PostgreSQL 16 para persistencia local o una base gestionada para producción.

## Instalación

```bash
npm install
```

Copiar el archivo de entorno de API y completar sus valores:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

## Desarrollo local

En terminales separadas:

```bash
npm run dev:api
npm run dev:web
```

La web se sirve normalmente en `http://localhost:5173` y la API en
`http://localhost:3001`. Vite redirige las solicitudes `/api/*` al servidor
local de la API.

## Base de datos

Para iniciar PostgreSQL local con Docker:

```bash
docker compose up -d
npm run db:migrate --workspace @reformapro/api
```

El comando principal aplica de forma idempotente el esquema base y las
ampliaciones de jornadas, notificaciones, flujo comercial y auditoría. Debe
ejecutarse una vez contra cada base tras desplegar cambios de esquema.

La primera ejecución puede crear un administrador usando las variables
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` y `SEED_ADMIN_NAME` de `apps/api/.env`.
No uses las credenciales de ejemplo fuera de tu entorno local.

## Comandos

```bash
npm run typecheck
npm run test
npm run build

npm run typecheck --workspace @reformapro/web
npm run build --workspace @reformapro/web
npm run typecheck --workspace @reformapro/api
npm run db:migrate --workspace @reformapro/api
```

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL. Obligatoria en producción. |
| `RESEND_API_KEY` | Clave de Resend para invitaciones de cuentas y avisos transaccionales. |
| `EMAIL_FROM` | Remitente verificado en Resend, p. ej. `Hogaria <info@hogaria.design>`. |
| `APP_URL` | URL pública, p. ej. `https://www.hogaria.design`. |
| `BLOB_READ_WRITE_TOKEN` | Acceso al almacén privado de documentos. |
| `CLIENT_NOTIFICATIONS_ENABLED` | Activa los avisos transaccionales al cliente (`true`/`false`). |
| `CRON_SECRET` | Secreto usado por el cron de Vercel para reintentar avisos. |
| `NOTIFICATION_RETRY_SECRET` | Secreto alternativo del workflow de reintentos de GitHub Actions. |
| `HMAC_SECRET` | Secreto de al menos 32 caracteres para sesiones y firmas. Obligatorio en producción. |
| `ALLOWED_ORIGINS` | Orígenes CORS adicionales, separados por comas. |
| `SEED_ADMIN_EMAIL` | Email del administrador inicial. |
| `SEED_ADMIN_PASSWORD` | Contraseña del administrador inicial. |
| `SEED_ADMIN_NAME` | Nombre del administrador inicial. |
| `VITE_API_URL` | URL de API para el frontend. En Vercel puede omitirse para usar `/api`. |

## Despliegue en Vercel

El repositorio incluye `vercel.json`, reescrituras para las rutas de la SPA y
funciones serverless en `api/`. Importa el repositorio en Vercel usando la raíz
del proyecto. El build de Vercel genera primero el bundle CommonJS de la API y
después la SPA de Vite. Configura las variables de producción y aplica la
migración contra una base PostgreSQL gestionada antes de publicar.

Consulta [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) para la guía de despliegue.

## Contenido de la landing

El contenido comercial no está repartido por el proyecto:

- Las tarjetas de obras y servicios se editan en
  `apps/web/src/features/solicitudes/portfolio.data.ts`.
- El caso de estudio destacado, textos principales, contacto y formulario se
  encuentran en `apps/web/src/features/solicitudes/components/PublicLanding.tsx`.
- Las imágenes públicas se sirven desde `apps/web/public/images/portfolio/` y
  los recursos de marca desde `apps/web/public/brand/`.

Al añadir una obra con caso de estudio, su tarjeta debe enlazar a una sección o
ruta concreta; no debe reutilizarse el destino de otra obra.

## Seguridad y producción

- Producción no permite usar repositorios en memoria: requiere PostgreSQL.
- Las claves HMAC persisten mediante `HMAC_SECRET`; no se generan por instancia.
- CORS se limita a mismo origen y a `ALLOWED_ORIGINS`.
- No subas `apps/api/.env`, credenciales ni secretos al repositorio.
- Las cuentas creadas desde administración nacen inactivas y reciben un enlace
  de activación de un solo uso. El enlace caduca, queda invalidado tras fijar la
  contraseña y puede reenviarse desde la ficha de una cuenta inactiva.
- Los binarios se guardan en Vercel Blob privado (`BLOB_READ_WRITE_TOKEN`).
  PostgreSQL conserva sus metadatos y clasificación; la API comprueba permisos
  específicos de contrato/factura antes de servir cada descarga. Los documentos
  sensibles antiguos sin clasificar no se muestran a profesionales.

## Jornadas y costes

El módulo **Jornadas** permite configurar tarifas históricas, registrar fichajes de empleados o partes de colaboradores, revisar/corregir/aprobar y comparar el coste de mano de obra por obra. Los profesionales acceden desde **Mi trabajo**; los clientes no tienen acceso a esos datos.

Antes de habilitarlo, ejecuta la migración principal y configura las tarifas
históricas de cada profesional. Los clientes no acceden a jornadas, tarifas ni
costes internos.

## Presupuestos: búsqueda y PDF

El listado permite buscar y filtrar por estado. Las propuestas publicadas se pueden
descargar en PDF. No se envían documentos por correo.
Los importes admiten como máximo dos decimales; cada línea y su IVA se redondean
a céntimos antes de acumular el total. Los avisos automáticos informan de
novedades sin adjuntar documentos y solo se envían cuando
`CLIENT_NOTIFICATIONS_ENABLED=true`; los fallidos quedan en cola para el cron
diario configurado en `vercel.json`.

## Licencia

Proyecto privado de Hogaria.
