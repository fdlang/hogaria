# ReformaPro — Arquitectura refactorizada

Este documento explica la refactorización del fichero único de 5.090 líneas a un monorepo con separación por capas y feature slices.

---

## 1. Estructura de carpetas

```
reformapro/
├── packages/
│   ├── domain/                      # Núcleo del negocio. CERO dependencias externas.
│   │   └── src/
│   │       ├── entities/            # User, Project, Budget, BudgetLine, Signature
│   │       ├── value-objects/       # Money, IVARate, Email, Percentage, DocumentHash
│   │       ├── errors/              # DomainError hierarchy (NotFound, Forbidden, ...)
│   │       ├── services/            # calculateBudget(), PermissionPolicy class
│   │       ├── repositories/        # Interfaces IUserRepository, IBudgetRepository, ...
│   │       └── events/              # BudgetSigned, UserCreated, IEventEmitter
│   │
│   └── contracts/                   # DTOs compartidos web↔api (shape of HTTP payloads)
│
├── apps/
│   ├── api/                         # Backend (Node.js / NestJS-style structure)
│   │   └── src/
│   │       ├── auth/                # LoginUseCase, token service, guards
│   │       ├── application/
│   │       │   └── use-cases/       # One file per business action (SignBudget, CreateBudget, ...)
│   │       ├── infrastructure/
│   │       │   ├── database/        # Concrete repositories (TypeORM / Prisma implementations)
│   │       │   ├── crypto/          # WebCrypto services, bcrypt, JWT
│   │       │   └── audit/           # Persistent audit log writer
│   │       └── interfaces/
│   │           └── http/            # Controllers / routes / validation schemas
│   │
│   └── web/                         # React SPA
│       └── src/
│           ├── app/                 # Composition root: bootstrap, providers, routes
│           ├── features/            # Feature slices — each owns its api + hooks + UI
│           │   ├── auth/
│           │   │   ├── api/         # authApi, httpClient for auth
│           │   │   ├── auth.store.ts   # pub/sub session state
│           │   │   ├── hooks/useAuth.ts
│           │   │   └── components/LoginForm.tsx
│           │   ├── budgets/
│           │   │   ├── api/         # BudgetsApi + useBudgets/useBudgetCalculator
│           │   │   ├── hooks/
│           │   │   └── components/  # BudgetForm, BudgetLineEditor, BudgetList
│           │   ├── signatures/
│           │   │   ├── api/
│           │   │   ├── hooks/useSignatureFlow.ts    # state machine
│           │   │   └── components/SignatureWizard.tsx, SignatureCanvas.tsx
│           │   ├── projects/
│           │   ├── users/
│           │   ├── files/
│           │   ├── catalog/
│           │   ├── solicitudes/
│           │   └── audit/
│           ├── shared/              # Cross-feature primitives
│           │   ├── ui/              # Button, Input, Modal, ErrorBoundary (PRESENTATIONAL only)
│           │   ├── hooks/           # usePermissions, useDebounce, useClickOutside
│           │   ├── lib/             # apiClient, formatters, date utils
│           │   └── types/
│           └── pages/               # Route-level layouts (admin, client, profesional dashboards)
```

---

## 2. Decisiones arquitectónicas clave

### 2.1 Clean Architecture por capas

La regla de dependencias es **unidireccional**:

```
presentation (UI) ──▶ features (api, hooks, store) ──▶ shared/lib ──▶ domain
                                      │
                                      └─▶ infrastructure (HTTP, crypto)
```

Ningún fichero del **domain** importa de React, fetch, localStorage, DOM, Node.js, ni nada con efectos secundarios. Esto hace que:
- Los tests del dominio son instantáneos (sin mocks, sin red).
- El dominio es portable a React Native, backend, workers, CLI, lo que sea.
- Los cambios de framework no tocan reglas de negocio.

### 2.2 Value Objects vs primitive obsession

En el fichero original había flotantes de dinero por todas partes, IVAs como `21`, `0.21` o `"21%"` dependiendo del sitio, y emails como strings sin validar. Ahora:

- `Money` almacena **céntimos enteros** — elimina el error de redondeo floating-point. Operaciones aritméticas están encapsuladas (`plus`, `minus`, `times`), comparaciones por valor, moneda explícita.
- `IVARate` tiene `DEFAULT = 21` como única fuente de verdad y está bounded a 0-100.
- `Email`, `Percentage`, `DocumentHash` auto-validan en su constructor.

Esto elimina **38 sitios** donde el fichero original hacía `parseFloat(...)` con lógica defensiva ad-hoc.

### 2.3 Repository pattern + Dependency Inversion

El dominio declara **interfaces** (`IBudgetRepository`). La infraestructura las **implementa** (`PrismaBudgetRepository`, `InMemoryBudgetRepository` para tests). Los use-cases reciben la interface vía constructor, nunca la concreción.

Ventaja práctica: el día que se migre del mock en memoria a PostgreSQL, **no cambia ni una línea** de los use-cases ni del dominio.

### 2.4 Use Cases: Single Responsibility Principle

Cada acción de negocio = un fichero = una clase con **un solo método público** `.execute()`. Compárese:

| Antes (fichero original)                          | Después                                     |
| ------------------------------------------------- | ------------------------------------------- |
| `API.firmarPresupuesto` de 80 líneas              | `SignBudgetUseCase.execute()` + helpers privados |
| Mezcla challenge, password, hash, audit, persist  | 8 pasos numerados, cada uno legible         |
| Imposible testar el paso "verify challenge" solo  | Cada dependencia inyectada es un mock       |

### 2.5 Feature slices (apps/web/src/features/*)

En lugar de carpetas `components/`, `hooks/`, `services/` transversales (que obligan a saltar por 4 carpetas para entender una feature), cada dominio UI es **cohesivo**:

```
features/signatures/
  ├── api/            ← cómo hablar con el backend
  ├── hooks/          ← cómo exponerlo a React
  └── components/     ← cómo renderizarlo
```

Beneficio: borrar una feature = borrar una carpeta. Onboarding de un dev nuevo = leer una carpeta.

### 2.6 Presentational vs Container components

Los componentes en `features/*/components/` son **presentacionales puros**: reciben props, renderizan JSX, llaman callbacks. La lógica vive en hooks (`useSignatureFlow`, `useBudgets`). Esto permite:
- Storybook trivial (solo props).
- Tests snapshot sin mockear fetch.
- Reutilizar la misma UI en admin/cliente/profesional con distintos hooks por detrás.

### 2.7 Explicit state machines para flujos complejos

El flujo de firma de 4 pasos se modela con un `useReducer` donde el estado es una **discriminated union**. Estados imposibles (e.g. "firmando sin canvas") son imposibles de representar en el tipo. Compárese con el original, que usaba 5 `useState` independientes y booleanos que podían entrar en combinaciones inválidas.

### 2.8 Composition root único (apps/web/src/app/main.tsx)

Todas las dependencias concretas (`ApiClient`, `AuthStore`, `BudgetsApi`) se instancian **en un solo sitio** y se inyectan por props/context. Ningún componente hace `new ApiClient()` porque si no la testabilidad se desvanece.

### 2.9 PermissionPolicy centralizado

En vez de sprinkling `if (user.rol === "admin")` por 30 sitios, hay **una clase** `PermissionPolicy` con un método `.can(user, action, context)`. El hook `usePermissions` la expone a React. Ventajas:
- Auditoría de seguridad = leer un fichero.
- Cambiar política = un commit, no 30.
- Tests de permisos sin renderizar un componente.

### 2.10 Error Boundaries explícitos

`ErrorBoundary` envuelve el root Y los subtrees peligrosos (PDF viewer, signature canvas, lazy-loaded features). El original no tenía ninguno: un error en cualquier componente mataba toda la app.

### 2.11 Transport layer encapsulado

`ApiClient` es la **única** vía de salida HTTP. Centraliza: header Authorization, interceptor 401 → signOut, mapeo DomainError → ApiError, timeouts, retries. Los features no llaman `fetch()` directamente.

---

## 3. Qué NO se cambió (preservación de comportamiento)

- El cálculo de `calcPresupuesto` (con IVA por tramos y guards) es idéntico en resultado — solo que ahora opera sobre `Money` y `IVARate` en lugar de `parseFloat`.
- El flujo de firma (challenge HMAC → canvas → password → confirm) es idéntico en pasos y semántica.
- Los 29 endpoints de la API tienen el mismo contrato que antes; cambia solo dónde vive la lógica.
- Los permisos granulares por profesión se conservan en `PermissionPolicy.PROFESSIONAL_ACCESS`.

---

## 4. Próximos pasos recomendados (3 fases)

1. **Fase 1 — Backend real.** Sustituir InMemoryRepositories por TypeORM + PostgreSQL. Sustituir `HMACKeyProvider` por un JWT RS256 con clave privada server-side y pública distribuida. Sustituir `verifyPassword` por bcrypt comparison.

2. **Fase 2 — React Query.** Sustituir los `useState + useEffect` en hooks (`useBudgets`, `useProjects`) por `@tanstack/react-query` para cache compartido, invalidación automática y optimistic updates.

3. **Fase 3 — Tests.** Unit tests del dominio (cero deps, instantáneos), integration tests de use-cases (con repositorios in-memory), y e2e con Playwright para el flujo de firma completo. Meta: 80% coverage del dominio, 60% de los use-cases.
