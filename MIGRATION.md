# Migración de ReformaPro a Hogaria

La migración desde el prototipo monolítico `reforma-app.jsx` está completada.
Este archivo resume el destino actual; el prototipo ya no es fuente de verdad.

## Arquitectura vigente

```text
apps/web/        React 18, Vite, interfaz pública y áreas privadas
apps/api/        Controladores, casos de uso e infraestructura
packages/domain/ Reglas, políticas, cálculos y contratos de dominio puros
api/             Entrypoints serverless de Vercel
```

- `packages/domain` no depende de React, Node, PostgreSQL ni HTTP.
- Los casos de uso dependen de puertos; `apps/api/src/bootstrap.ts` conecta la
  infraestructura PostgreSQL, correo, Blob, auditoría y criptografía.
- La autorización se comprueba por rol y recurso en la API. La visibilidad del
  frontend no sustituye esos controles.
- Los nombres npm `@reformapro/*` se conservan por compatibilidad interna; el
  producto y la marca pública son Hogaria.

## Equivalencias principales

| Responsabilidad original | Implementación actual |
| --- | --- |
| Autenticación y sesiones | `apps/api/src/application/use-cases/auth.use-cases.ts` y `apps/web/src/features/auth/` |
| Usuarios e invitaciones | `user.use-cases.ts`, `account-activation.use-cases.ts` y `features/users/` |
| Presupuestos y versiones | `sales.use-cases.ts`, `estimate-document.use-cases.ts` y `features/sales/` |
| Obras y asignaciones | `project.use-cases.ts`, `project-professionals.use-cases.test.ts` y `features/projects/` |
| Jornadas, tarifas y costes | `work-tracking.use-cases.ts`, `postgresWorkStore.ts` y `features/work/` |
| Documentos privados | `file.use-cases.ts`, `professional-document.use-cases.ts` y Vercel Blob |
| Solicitudes comerciales | `solicitud.use-cases.ts` y `features/solicitudes/` |
| Auditoría | `infrastructure/audit/`, repositorios PostgreSQL y `features/audit/` |
| Reglas puras | `packages/domain/src/*.ts` y `packages/domain/src/rules/` |

## Persistencia y migraciones

PostgreSQL es obligatorio en producción. El runner
`apps/api/scripts/migrate.mjs` aplica las migraciones en orden, registra versión
y checksum en `schema_migrations` y usa bloqueo para evitar dos ejecuciones
simultáneas. Los scripts históricos se conservan por compatibilidad, pero el
punto de entrada operativo es:

```bash
npm run db:migrate --workspace @reformapro/api
```

No se deben ejecutar migraciones de producción desde una sesión de desarrollo
sin copia verificada, ventana de cambio y autorización explícita.

## Estado del frontend

- Las rutas privadas se dividen en chunks mediante `React.lazy`.
- `ApiClient` aplica timeout, cancelación y errores de red tipados.
- La sesión respeta la expiración emitida por la API.
- Autenticación y listados de presupuestos validan contratos en runtime.
- Las imágenes del portfolio tienen derivados responsivos; el vídeo destacado
  usa autoplay silencioso al entrar en pantalla y se pausa al salir.
- Los flujos críticos disponen de pruebas Playwright en Chromium y WebKit.

## Validación vigente

Antes de integrar o desplegar:

```bash
npm run typecheck
npm run test
npm run build
npm run test:browser --workspace @reformapro/web
```

La referencia validada el 03/10/2026 ejecuta 299 tests unitarios y 122 pruebas
de navegador. El build de Production comprueba además la configuración crítica
antes de sustituir la versión estable.

## Criterio para cambios nuevos

- Regla o cálculo puro: `packages/domain` con metadatos y tests.
- Orquestación con efectos: `apps/api/src/application/use-cases/`.
- PostgreSQL, correo, Blob o criptografía: `apps/api/src/infrastructure/`.
- HTTP, validación de entrada y DTO: `apps/api/src/interfaces/http/`.
- Pantalla o flujo: `apps/web/src/features/<feature>/`.
- Primitivo reutilizable: `apps/web/src/shared/`.

No se prevé una reescritura a NestJS, TypeORM, JWT o React Query. Cualquier
nueva dependencia o abstracción debe justificar una necesidad medible y entrar
de forma incremental.
