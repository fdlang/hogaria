# AGENTS.md
 
## Proyecto
- Hogaria: monorepo npm workspaces. Node 24, TypeScript.
- `apps/web`: React 18 + Vite. `apps/api`: API por capas (controladores, casos de uso, repositorios). `packages/domain`: reglas de negocio puras. `api/`: entrypoints serverless de Vercel.
- PostgreSQL con `pg`, Bcrypt, HMAC propio para sesiones, Vercel Blob privado, Resend.
- Roles de usuario: administración, clientes y profesionales.

## Arquitectura
- `packages/domain` no importa React, Node, PostgreSQL, HTTP ni nada de `apps/*`.
- Los casos de uso no dependen de infraestructura concreta; el cableado vive en `apps/api/src/bootstrap.ts`.
- Todo endpoint comprueba permisos por rol y por recurso. Ningún cliente o profesional accede a datos ajenos.
- Dinero y fechas: sin errores de precisión decimal ni de zona horaria.
- Cambios pequeños e incrementales. Tests antes de refactorizar. Sin abstracciones ni dependencias nuevas sin necesidad demostrada.

## Reglas de negocio
- Toda regla de negocio vive en `packages/domain` como código con tests, no dispersa en controladores, SQL o frontend.
- Cada regla nueva o modificada lleva junto a ella: origen (legal/fiscal, negocio, técnica o seguridad), supuesto que la justifica, vigencia y fecha de próxima revisión.
- Las reglas fiscales y contables se marcan como "a validar por gestor". Las reglas retiradas se marcan como obsoletas con vigencia hasta una fecha; no se borran si afectan a datos históricos.
- Umbrales, importes y tipos impositivos no se escriben a fuego: son parámetros con vigencia.

## Seguridad
- No abras, leas ni imprimas `apps/api/.env` ni ningún secreto.
- Si encuentras un secreto en el código o en el historial, reporta solo archivo, línea y tipo. Nunca copies su valor.
- Nunca ejecutes migraciones contra una base que no sea la local de desarrollo.
- Pregunta antes de cambios destructivos o irreversibles: migraciones sobre datos existentes, cambios de contrato de la API, rotación de secretos o cambios que invaliden sesiones.

## Validación
- Antes de dar una tarea por terminada, ejecuta `npm run typecheck`, `npm run test` y `npm run build` en la raíz, más typecheck y build de cada workspace afectado.
- Corrige lo que falle por tus cambios.
- Commits atómicos con Conventional Commits.

## Documentation files
- Do not create .md or other explanatory files to summarize or document your work.
- Exception: for large or multi-session tasks, you may keep ONE notes file at `NOTES.md` (or update it if it exists).
  - Max ~15 lines, bullet points only, no prose or paragraphs.
  - Only include: current status, what's done, what's pending, key decisions.
  - Overwrite/update it instead of appending; delete finished items.
- Never create README, PLAN, SUMMARY, CHANGES, or similar files unless I explicitly ask.
- If a change makes an existing guide false (docs/*.md, VERCEL_DEPLOY.md), fix only that sentence.
- Report results in chat in a short message.

## Subagentes
- Para auditorías completas, usa tres subagentes en paralelo, uno por especialidad:
  - Frontend: `apps/web`.
  - Backend: `apps/api`, `packages/domain`, `api/`.
  - Ciberseguridad: transversal a web, API e infraestructura.
- Los subagentes trabajan en modo lectura: no crean, editan ni borran archivos, ni ejecutan comandos con efectos secundarios.
- Cada subagente reporta solo lo de su especialidad. Lo que detecte de otra área lo anota en una línea como "derivado a [agente]", sin analizarlo.
- Si dos agentes discrepan (p. ej. rendimiento vs. seguridad), prevalece seguridad.
- El agente principal aplica todos los cambios y valida el resultado.
- No delegar tareas pequeñas ni pasos que dependan unos de otros.
