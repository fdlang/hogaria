# Guía de migración — ReformaPro

De **5.090 líneas en un solo fichero** (`reforma-app.jsx`) a un **monorepo Clean Architecture** con **95 ficheros, ~8.500 líneas** distribuidos en capas correctamente tipadas, testadas y desacopladas.

## Estado de typechecks (`tsc --noEmit`)

| Paquete | Modo strict | Errores | Notas |
|---|---|---|---|
| `packages/domain`  | `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes` | **0** | Producción-ready |
| `apps/api`         | `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes` | **0** | Producción-ready (con stubs offline para Node hasta `npm i @types/node`) |
| `apps/web`         | `strict + noUncheckedIndexedAccess` (sin exactOptional, sin noImplicitAny) | **0** | Modo permisivo temporal por stubs offline para React; restaurar al modo estricto tras `npm i @types/react @types/react-dom` |

Los `*-stubs.d.ts` en `apps/api/src/types/` y `apps/web/src/types/` existen únicamente para que el proyecto typechequee **sin acceso al npm registry**. Una vez instaladas las dependencias reales (`@types/node`, `@types/react`, `@types/react-dom`), se eliminan ambos archivos y se restaura `exactOptionalPropertyTypes: true` y `noImplicitAny: true` en `apps/web/tsconfig.json`. La API y el dominio NO requieren ningún relax.

---

## Mapa de ubicaciones

| Era en `reforma-app.jsx` | Ahora está en |
|---|---|
| `const Security = { hashDocument, signToken, verifyToken }` | `apps/api/src/infrastructure/crypto/crypto.service.ts` |
| `_keyPromise` (race fix) | `HMACKeyProvider.getKey()` |
| `generateTempPassword` | `crypto.service.ts` (rejection sampling) |
| `const DB = {...}` (seed data) | `apps/api/src/infrastructure/database/inMemoryRepositories.ts` |
| `authorize(token, role?)` | `requireAuth()` middleware + `PermissionPolicy.authorize()` |
| `const API = { login, getUsers, ... }` (29 endpoints) | `apps/api/src/interfaces/http/*Controller.ts` + use-cases |
| `calcPresupuesto()` + helpers | `packages/domain/src/services/index.ts` → `calculateBudget()` |
| `PROFESION_PERMISOS` | `packages/domain/src/services/index.ts` → `PermissionPolicy.PROFESSIONAL_ACCESS` |
| `PROFESIONES` catálogo | `packages/domain/src/constants.ts` |
| `CATALOGO` (items de presupuesto) | `apps/web/src/features/catalog/catalog.ts` |
| `AuthProvider` + `useAuth` | `apps/web/src/features/auth/auth.store.ts` + `hooks/useAuth.ts` |
| `NotifProvider` + `useNotif` | `apps/web/src/shared/ui/notifications.tsx` |
| `Modal`, `Input`, `SelectEl`, `Textarea` | `apps/web/src/shared/ui/index.tsx` (con a11y) |
| `if (!confirm("..."))` × 20 veces | `apps/web/src/shared/ui/confirm.tsx` → `useConfirm()` |
| Tablas inline × 4 | `apps/web/src/shared/ui/data-table.tsx` → `DataTable<T>` |
| Stat cards inline × 8 | `apps/web/src/shared/ui/stat-card.tsx` → `StatCard` |
| `const [loading, error, data]` × 10 | `apps/web/src/shared/hooks/useResource.ts` → `useResource<T>()` |
| Flujo de firma 4 pasos | `apps/web/src/features/signatures/hooks/useSignatureFlow.ts` (state machine) |
| `AdminPresupuestos` | `apps/web/src/features/budgets/components/AdminBudgets.tsx` |
| `AdminProjects` | `apps/web/src/features/projects/components/AdminProjects.tsx` |
| `AdminUsers` | `apps/web/src/features/users/components/AdminUsers.tsx` |
| `AdminProfesionales` | `apps/web/src/features/users/components/AdminProfesionales.tsx` |
| `AdminActivity` | `apps/web/src/features/audit/components/AdminActivity.tsx` |
| `ClientDashboard` | `apps/web/src/features/projects/components/ClientDashboard.tsx` |
| `ClientProjectDetail` + `ProfesionalProjectDetail` | `apps/web/src/features/projects/components/ProjectDetail.tsx` (unificado 3 roles) |
| `ClientFirmas` | `apps/web/src/features/budgets/components/ClientBudgets.tsx` |
| `ProfesionalDashboard` | `apps/web/src/features/projects/components/ProfesionalDashboard.tsx` |
| `generatePresupuestoPDF` | `apps/web/src/features/budgets/pdf/generateBudgetPDF.ts` (CompanyBranding inyectable) |
| `formatCurrency`, `formatDate` | `apps/web/src/shared/lib/formatters.ts` |

---

## Las 5 abstracciones que eliminaron la duplicación masiva

### 1. `useResource<T>` — un solo patrón para todos los list/fetch

Antes:
```tsx
const [data, setData]     = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError]   = useState(null);

useEffect(() => {
  let alive = true;
  API.getBudgets(token)
    .then(d => alive && setData(d))
    .catch(e => alive && setError(e.message))
    .finally(() => alive && setLoading(false));
  return () => { alive = false; };
}, [token]);
```
(Repetido en 10+ componentes.)

Después:
```tsx
export function useBudgets(api: BudgetsApi, proyectoId?: number) {
  return useResource<BudgetDTO[]>(() => api.list(proyectoId), [api, proyectoId]);
}

// In component:
const budgets = useBudgets(apis.budgets);
if (budgets.loading) return <Spinner />;
if (budgets.error)   return <ErrorMessage />;
return <BudgetList data={budgets.data ?? []} />;
```

### 2. `useMutation<Args, R>` — create/update/delete con `loading` / `error`

```tsx
const mutations = useBudgetMutations(api);
await mutations.send.mutate(budget.id);
// mutations.send.loading / .error available while in flight
```

### 3. `DataTable<T>` — tablas sortables declarativas

Antes: tabla inline con `<table>`, `<thead>`, sort manual por cada columna, rowClick inline. Repetido en 4 vistas (~120 líneas cada una).

Después:
```tsx
const columns: ColumnDef<BudgetDTO>[] = [
  { key: "nombre", header: "Nombre", sortBy: b => b.nombre, render: b => <strong>{b.nombre}</strong> },
  { key: "estado", header: "Estado", render: b => <BudgetStatusBadge estado={b.estado} /> },
];
<DataTable data={filtered} columns={columns} rowKey={b => b.id} actions={row => <ActionButtons budget={row} />} />
```

### 4. `useConfirm()` — confirmaciones promise-based

Antes: 20+ llamadas a `if (!window.confirm("...")) return;` sin estilo, sin a11y, imposible de testear.

Después:
```tsx
const confirm = useConfirm();
const ok = await confirm({
  title: "Eliminar presupuesto",
  message: <>¿Eliminar <strong>{b.nombre}</strong>?</>,
  variant: "danger",
});
if (!ok) return;
```

### 5. `StatCard` + `PageHeader` — primitivos de layout

Eliminaron ~400 líneas de `<h1>Dashboard</h1>` + `<div style={{}}>` copiados en 6 páginas.

---

## Estructura del monorepo

```
reformapro/
├── packages/
│   └── domain/                       # Puro, 0 deps, 0 I/O
│       ├── src/
│       │   ├── constants.ts          # PROFESIONES, PROJECT_ESTADOS, BUDGET_ESTADOS, etc.
│       │   ├── entities/             # User, Project, Budget, BudgetLine, Signature, AuditEntry
│       │   ├── value-objects/        # Money (cents), IVARate, Percentage, Email, DocumentHash
│       │   ├── errors/               # DomainError jerarquía
│       │   ├── services/             # calculateBudget(), PermissionPolicy
│       │   ├── repositories/         # Interfaces
│       │   └── events/               # DomainEvent union + IEventEmitter
│       └── services/*.test.ts        # Tests unitarios (sin mocks, sin DOM)
│
└── apps/
    ├── api/                          # Backend Clean Architecture
    │   └── src/
    │       ├── application/use-cases/ # Orquestación (1 clase = 1 acción)
    │       │   ├── auth.use-cases.ts
    │       │   ├── budget.use-cases.ts          # Create/Send/Delete/List/Challenge
    │       │   ├── sign-budget.use-case.ts      # 8-step signature flow con HMAC
    │       │   ├── user.use-cases.ts
    │       │   ├── project.use-cases.ts         # Con allowlist por rol
    │       │   ├── solicitud.use-cases.ts       # Rate-limited público
    │       │   ├── file.use-cases.ts
    │       │   └── audit.use-cases.ts
    │       ├── infrastructure/
    │       │   ├── crypto/           # HMACKeyProvider, WebCryptoTokenService, SignatureService
    │       │   ├── database/         # InMemory*Repository, PasswordHasher (bcrypt)
    │       │   ├── events/           # InMemoryEventEmitter (pub/sub)
    │       │   └── audit/            # AuditSubscriber (suscribe a eventos, persiste)
    │       ├── interfaces/http/      # Controllers + errorMiddleware
    │       └── bootstrap.ts          # Composition root
    │
    └── web/                          # Frontend Clean Architecture
        └── src/
            ├── app/
            │   ├── main.tsx          # DI: ApiClient + AuthStore + 7 Feature APIs + 4 providers
            │   ├── App.tsx           # Routes + TopBar
            │   ├── Router.tsx        # Hash router con role guards + longest-prefix matching
            │   └── global.css        # Resets + spin keyframe
            ├── shared/
            │   ├── ui/               # Modal, Button, Input, Textarea, Select, Spinner, Badge,
            │   │                      # EmptyState, ErrorBoundary, Notifications, Confirm,
            │   │                      # DataTable, StatCard, PageHeader, badges
            │   ├── hooks/            # useResource, useMutation, withOptimistic, usePermissions
            │   └── lib/              # api-client, formatters
            └── features/
                ├── audit/            # api + AdminActivity
                ├── auth/             # store + hook + LoginPage
                ├── budgets/          # api + hooks (useBudgets con state machine) + PDF + 5 components
                ├── catalog/          # static data + CatalogPicker
                ├── files/            # api + useProjectFiles
                ├── projects/         # api + hooks (con optimistic updaters) + 5 components
                ├── signatures/       # state machine hook + Canvas + Wizard
                ├── solicitudes/      # api + PublicLanding + AdminSolicitudes
                └── users/            # api + hooks + AdminUsers + AdminProfesionales
```

---

## Próximos pasos para producción

Fase 1 — **Backend**: NestJS + TypeORM + Postgres. Bcrypt cost 12. JWT RS256. Redis para challenges + rate limits.

Fase 2 — **Data layer**: Sustituir `useResource` con `@tanstack/react-query`. La interfaz de consumo no cambia — los hooks se adaptan internamente.

Fase 3 — **Tests**: ≥80% coverage en dominio, ≥60% en use-cases. E2E con Playwright (login → crear presupuesto → firmar → auditar).

---

## Regla de oro para añadir algo nuevo

- **Regla de negocio pura** → `packages/domain/src/services/`
- **Operación con efectos** → `apps/api/src/application/use-cases/`
- **Cómo hablar con X externo** → `apps/api/src/infrastructure/` o `apps/web/src/features/*/api/`
- **Primitive visual reutilizable** → `apps/web/src/shared/ui/`
- **Vista compuesta de una feature** → `apps/web/src/features/*/components/`
- **Lógica que React consume** → `apps/web/src/features/*/hooks/` o `shared/hooks/`
- **Tipo compartido web↔api** → `packages/contracts/src/`

Si algo parece repetirse, para y búscalo en `shared/`. Está ahí.
