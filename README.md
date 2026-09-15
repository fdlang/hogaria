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

- Node.js 20.9 o superior.
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
| `HMAC_SECRET` | Secreto de al menos 32 caracteres para sesiones y firmas. Obligatorio en producción. |
| `ALLOWED_ORIGINS` | Orígenes CORS adicionales, separados por comas. |
| `SEED_ADMIN_EMAIL` | Email del administrador inicial. |
| `SEED_ADMIN_PASSWORD` | Contraseña del administrador inicial. |
| `SEED_ADMIN_NAME` | Nombre del administrador inicial. |
| `VITE_API_URL` | URL de API para el frontend. En Vercel puede omitirse para usar `/api`. |

## Despliegue en Vercel

El repositorio incluye `vercel.json`, fallback para History API y funciones
serverless en `api/`. Importa el repositorio en Vercel usando la raíz del
proyecto, configura las variables de producción y aplica la migración contra
una base PostgreSQL gestionada antes de publicar.

Consulta [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) para la guía de despliegue.

## Seguridad y producción

- Producción no permite usar repositorios en memoria: requiere PostgreSQL.
- Las claves HMAC persisten mediante `HMAC_SECRET`; no se generan por instancia.
- CORS se limita a mismo origen y a `ALLOWED_ORIGINS`.
- No subas `apps/api/.env`, credenciales ni secretos al repositorio.
- La carga de binarios requiere un proveedor de objetos, como Vercel Blob o S3,
  antes de habilitarla en producción.

## Licencia

Proyecto privado de Hogaria.
