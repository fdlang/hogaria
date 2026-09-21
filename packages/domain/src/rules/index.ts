export type RuleOrigin = "legal_fiscal" | "business" | "technical" | "security";
export type FunctionalOwner = "direccion" | "comercial" | "operaciones" | "administracion" | "seguridad";

export interface RuleMetric {
  id: string;
  meaning: string;
  source: "audit_log" | "database" | "not_instrumented";
}

export interface BusinessRuleMetadata {
  id: `HOG-${string}`;
  description: string;
  origin: RuleOrigin;
  owner: FunctionalOwner;
  assumption: string;
  validScale: string;
  validFrom: `${number}-${number}-${number}`;
  validUntil: `${number}-${number}-${number}` | null;
  nextReview: `${number}-${number}-${number}`;
  externalValidation?: "gestor" | "asesoria_juridica" | "dpd" | "gestor_y_dpd";
  metrics: readonly RuleMetric[];
  implementation: readonly string[];
  tests: readonly string[];
}

const metric = (id: string, meaning: string, source: RuleMetric["source"] = "not_instrumented"): RuleMetric => ({ id, meaning, source });

export const BUSINESS_RULES = [
  {
    id: "HOG-SEC-001", description: "Cada actor accede únicamente a proyectos y recursos propios o asignados.", origin: "security", owner: "seguridad",
    assumption: "Los tres roles actuales bastan para expresar propiedad y asignación.", validScale: "Una empresa y hasta miles de proyectos con asignaciones explícitas.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("authorization_denial_rate", "Denegaciones por comprobaciones de propiedad", "audit_log"), metric("cross_tenant_incidents", "Incidentes confirmados de acceso ajeno")],
    implementation: ["packages/domain/src/services/index.ts", "apps/api/src/application/use-cases/project.use-cases.ts", "apps/api/src/application/use-cases/file.use-cases.ts"],
    tests: ["apps/api/src/application/use-cases/security-regressions.test.ts", "apps/api/src/application/use-cases/project-professionals.use-cases.test.ts"],
  },
  {
    id: "HOG-SEC-002", description: "Los documentos se muestran según rol y clasificación, manteniendo contratos, facturas y reservados fuera del profesional.", origin: "security", owner: "seguridad",
    assumption: "Cinco clasificaciones cubren el ciclo documental actual.", validScale: "Hasta cientos de documentos por obra sin permisos individuales por archivo.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("document_access_denial_rate", "Descargas denegadas por clasificación", "audit_log"), metric("classification_correction_rate", "Documentos reclasificados tras su carga")],
    implementation: ["apps/api/src/application/use-cases/file.use-cases.ts"], tests: ["apps/api/src/application/use-cases/audit-regressions.test.ts", "apps/api/src/application/use-cases/security-regressions.test.ts"],
  },
  {
    id: "HOG-SEC-003", description: "El alta envía una única invitación automática, de un solo uso; solo se reenvía tras caducar o al reactivar.", origin: "security", owner: "seguridad",
    assumption: "El correo es el canal de incorporación verificado y cada cuenta mantiene como máximo una invitación vigente.", validScale: "Altas ocasionales; requiere cola duradera al crecer el volumen de invitaciones.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("activation_expiry_rate", "Invitaciones caducadas sin activación", "database"), metric("duplicate_identity_attempt_rate", "Altas duplicadas bloqueadas")],
    implementation: ["apps/api/src/application/use-cases/account-activation.use-cases.ts", "apps/api/src/infrastructure/database/activationTokenRepositories.ts"], tests: ["apps/api/src/application/use-cases/account-activation.use-cases.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-SEC-005", description: "La documentación laboral del profesional es privada y solo la administra el rol de administración.", origin: "security", owner: "seguridad",
    assumption: "La documentación laboral no forma parte de la documentación técnica compartida de una obra.", validScale: "Una empresa con profesionales internos y autónomos; revisar al incorporar RR. HH. externo.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("professional_document_access_denial_rate", "Accesos no administrativos bloqueados", "audit_log"), metric("professional_document_delete_rate", "Documentos laborales eliminados", "database")],
    implementation: ["apps/api/src/application/use-cases/professional-document.use-cases.ts"], tests: ["apps/api/src/application/use-cases/professional-document.use-cases.test.ts"],
  },
  {
    id: "HOG-SEC-006", description: "Las asignaciones de profesionales son operativa interna y nunca se exponen al cliente.", origin: "security", owner: "operaciones",
    assumption: "El cliente necesita conocer el avance y los responsables comunicados, no la planificación interna de personal.", validScale: "Una empresa con equipos propios y autónomos asignados individualmente.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("client_assignment_exposure_incidents", "Respuestas a clientes que contienen asignaciones internas"), metric("assignment_visibility_denial_rate", "Accesos bloqueados a datos internos de asignación", "audit_log")],
    implementation: ["apps/api/src/interfaces/http/projectController.ts", "apps/web/src/features/projects/components/ProjectDetail.tsx"], tests: ["apps/api/src/application/use-cases/security-regressions.test.ts", "apps/web/e2e/commercial-workflow.browser.ts"],
  },
  {
    id: "HOG-USR-001", description: "Siempre debe permanecer al menos un administrador activo.", origin: "security", owner: "direccion",
    assumption: "La continuidad operativa depende de administradores internos sin autoservicio de recuperación privilegiada.", validScale: "Una empresa con uno o varios administradores.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("last_admin_block_count", "Intentos bloqueados de desactivar al último administrador", "audit_log"), metric("active_admin_count", "Administradores activos", "database")],
    implementation: ["apps/api/src/application/use-cases/user.use-cases.ts", "apps/api/src/infrastructure/database/postgresRepositories.ts"], tests: ["apps/api/src/application/use-cases/security-regressions.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-USR-002", description: "Cada email identifica una sola cuenta y su ciclo distingue activación pendiente, cuenta activa y archivo.", origin: "security", owner: "administracion",
    assumption: "El email normalizado es el identificador operativo único de cada persona.", validScale: "Una empresa con miles de identidades; revisar si se incorporan varias organizaciones o identidades federadas.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("duplicate_identity_attempt_rate", "Altas duplicadas bloqueadas", "database"), metric("pending_activation_count", "Cuentas pendientes de activar", "database")],
    implementation: ["apps/api/src/application/use-cases/user.use-cases.ts", "apps/api/database/professional-users.sql"], tests: ["apps/api/src/application/use-cases/account-activation.use-cases.test.ts"],
  },
  {
    id: "HOG-COM-001", description: "Una solicitud se convierte de forma idempotente en una única oportunidad.", origin: "business", owner: "comercial",
    assumption: "Cada solicitud de la landing representa una intención comercial diferenciada.", validScale: "Hasta decenas de miles de solicitudes con clave de origen única.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("request_conversion_rate", "Solicitudes convertidas en oportunidad", "database"), metric("duplicate_conversion_count", "Intentos duplicados evitados")],
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts", "apps/api/src/infrastructure/database/postgresRepositories.ts"], tests: ["apps/api/src/infrastructure/database/audit-transactions.test.ts", "apps/web/e2e/commercial-workflow.browser.ts"],
  },
  {
    id: "HOG-EST-001", description: "Los borradores y costes internos de una propuesta nunca son visibles para el cliente.", origin: "security", owner: "comercial",
    assumption: "La propuesta pública y el cálculo interno comparten estructura pero tienen audiencias distintas.", validScale: "Miles de propuestas paginadas con separación por propietario.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("draft_exposure_incidents", "Incidentes de exposición de borradores o costes"), metric("proposal_visibility_denial_rate", "Accesos denegados a propuestas ajenas", "audit_log")],
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts"], tests: ["apps/api/src/application/use-cases/sales.use-cases.test.ts", "apps/api/src/application/use-cases/estimate-document.use-cases.test.ts"],
  },
  {
    id: "HOG-EST-002", description: "Cada versión enviada de una propuesta es inmutable y conserva su histórico descargable.", origin: "business", owner: "comercial",
    assumption: "La trazabilidad de lo ofrecido prevalece sobre editar una versión ya comunicada.", validScale: "Decenas de versiones por propuesta; requiere archivado si el histórico crece sin límite.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("proposal_revision_rate", "Versiones creadas por propuesta", "database"), metric("published_version_mutation_attempts", "Intentos bloqueados de modificar versiones publicadas", "audit_log")],
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts", "apps/api/database/commercial-workflow.sql"], tests: ["apps/api/src/application/use-cases/sales.use-cases.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-EST-003", description: "Solo el cliente propietario puede firmar la versión vigente, enviada, válida y sellada criptográficamente.", origin: "security", owner: "comercial",
    assumption: "La contraseña y la firma manuscrita son evidencia suficiente para el consentimiento electrónico actual.", validScale: "Contratación B2C de una sociedad; revisar con asesoría jurídica si cambia el nivel de firma exigido.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("signature_failure_rate", "Intentos de firma fallidos", "audit_log"), metric("expired_signature_attempts", "Firmas bloqueadas por caducidad", "audit_log")],
    externalValidation: "asesoria_juridica",
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts", "apps/api/src/infrastructure/crypto/crypto.service.ts"], tests: ["apps/api/src/application/use-cases/sales.use-cases.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-EST-004", description: "Solo una propuesta firmada puede convertirse explícitamente en proyecto.", origin: "business", owner: "comercial",
    assumption: "La firma es el único hito comercial que autoriza abrir la obra.", validScale: "Flujo lineal sin adjudicaciones parciales ni múltiples proyectos por propuesta.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("signed_to_project_conversion_rate", "Propuestas firmadas convertidas", "database"), metric("conversion_exception_rate", "Conversiones bloqueadas o rectificadas", "audit_log")],
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts"], tests: ["apps/api/src/application/use-cases/sales.use-cases.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-PRJ-001", description: "Los proyectos avanzan por transiciones de estado permitidas y solo finalizan al 100 %.", origin: "business", owner: "operaciones",
    assumption: "Planificación, curso, pausa y finalización describen todo el ciclo de obra.", validScale: "Obras sin fases contractuales independientes ni reapertura posterior al cierre.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("project_transition_denial_rate", "Transiciones de estado rechazadas", "audit_log"), metric("project_reopen_requests", "Solicitudes manuales de reapertura")],
    implementation: ["apps/api/src/application/use-cases/project.use-cases.ts"], tests: ["apps/api/src/application/use-cases/project-professionals.use-cases.test.ts"],
  },
  {
    id: "HOG-PRJ-002", description: "Un profesional asignado solo puede actualizar progreso y completar hitos existentes.", origin: "security", owner: "operaciones",
    assumption: "La planificación pertenece a administración y la ejecución se reporta desde obra.", validScale: "Equipos pequeños con hitos comunes; no cubre capataces o responsables de equipo.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("professional_update_denial_rate", "Ediciones profesionales rechazadas", "audit_log"), metric("admin_milestone_override_rate", "Correcciones administrativas de hitos")],
    implementation: ["apps/api/src/application/use-cases/project.use-cases.ts", "packages/domain/src/services/index.ts"], tests: ["apps/api/src/application/use-cases/project-professionals.use-cases.test.ts", "apps/api/src/application/use-cases/security-regressions.test.ts"],
  },
  {
    id: "HOG-CHG-001", description: "Una orden de cambio publicada es inmutable y solo incrementa el importe tras aprobación del cliente.", origin: "business", owner: "comercial",
    assumption: "Toda ampliación contractual se acepta de forma expresa y el rechazo no altera la obra.", validScale: "Órdenes independientes sin circuito multinivel de aprobación por importe.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("change_order_approval_rate", "Órdenes aprobadas frente a enviadas", "database"), metric("change_order_correction_rate", "Órdenes que requieren nueva versión")],
    externalValidation: "gestor",
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts", "apps/api/database/commercial-workflow.sql"], tests: ["apps/api/src/application/use-cases/sales.use-cases.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-WRK-001", description: "Solo un profesional activo y asignado puede iniciar una jornada en una obra.", origin: "business", owner: "operaciones",
    assumption: "Toda presencia en obra corresponde a una asignación previa.", validScale: "Plantilla y autónomos identificados individualmente; no cubre subcontratas por cuadrilla.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("unassigned_clock_in_denial_rate", "Fichajes rechazados por falta de asignación", "audit_log"), metric("manual_time_entry_rate", "Partes creados o corregidos manualmente")],
    implementation: ["apps/api/src/application/use-cases/work-tracking.use-cases.ts"], tests: ["apps/api/src/application/use-cases/work-tracking.use-cases.test.ts", "apps/web/e2e/work.browser.ts"],
  },
  {
    id: "HOG-WRK-002", description: "Las jornadas siguen entrada, pausas y salida válidas, y el coste se congela con la tarifa histórica aplicable.", origin: "business", owner: "administracion",
    assumption: "El coste laboral se calcula por tiempo o jornada con una tarifa individual vigente.", validScale: "Miles de partes mensuales; exige agregados si las estadísticas dejan de ser interactivas.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("time_entry_correction_rate", "Partes rectificados tras envío", "audit_log"), metric("missing_rate_block_rate", "Jornadas bloqueadas por falta de tarifa", "audit_log")],
    externalValidation: "gestor",
    implementation: ["packages/domain/src/work-tracking.ts", "apps/api/src/application/use-cases/work-tracking.use-cases.ts"], tests: ["apps/api/src/application/use-cases/work-tracking.use-cases.test.ts", "apps/api/src/infrastructure/database/postgresWorkStore.test.ts"],
  },
  {
    id: "HOG-CAT-001", description: "Solo administración mantiene el catálogo y archivar conserva el histórico comercial.", origin: "business", owner: "comercial",
    assumption: "Existe un catálogo común de precios de venta para una única unidad de negocio.", validScale: "Un mercado y una tarifa comercial; no cubre delegaciones, zonas o listas por cliente.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("catalog_override_rate", "Partidas presupuestadas con precio distinto al catálogo"), metric("catalog_archive_rate", "Partidas archivadas frente a activas", "database")],
    implementation: ["apps/api/src/application/use-cases/catalog.use-cases.ts"], tests: ["apps/api/src/application/use-cases/catalog.use-cases.test.ts", "apps/web/e2e/catalog.browser.ts"],
  },
  {
    id: "HOG-FIN-001", description: "Importes y porcentajes se validan en rangos finitos antes de persistirse.", origin: "technical", owner: "administracion",
    assumption: "Los importes se expresan en euros y dos decimales bastan para la operativa no contable.", validScale: "Presupuestos de hasta 1.000 millones de euros; no sustituye un libro contable.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("financial_validation_error_rate", "Entradas financieras rechazadas", "audit_log"), metric("rounding_rectification_rate", "Rectificaciones atribuibles a redondeo")],
    externalValidation: "gestor",
    implementation: ["packages/domain/src/value-objects/index.ts", "apps/api/src/application/use-cases/estimate-validation.ts", "apps/api/src/application/use-cases/project-validation.ts"], tests: ["apps/api/src/application/use-cases/audit-regressions.test.ts", "apps/api/src/application/use-cases/work-tracking.use-cases.test.ts"],
  },
  {
    id: "HOG-NTF-001", description: "Los cambios relevantes para el cliente generan notificación, salvo contenido reservado o acciones del propio cliente.", origin: "business", owner: "operaciones",
    assumption: "El correo es el canal suficiente para avisos no urgentes y el área privada conserva la fuente de verdad.", validScale: "Volumen moderado con reintentos por lotes; requiere preferencias y digestos al aumentar frecuencia.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("notification_delivery_rate", "Notificaciones entregadas frente a encoladas", "database"), metric("notification_retry_rate", "Reintentos por notificación", "database")],
    implementation: ["apps/api/src/application/notifications/client-notifications.ts", "apps/api/database/notification-outbox.sql"], tests: ["apps/api/src/application/notifications/client-notifications.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-SEC-004", description: "Cerrar sesión o cambiar contraseña, rol o activación revoca todas las sesiones emitidas anteriormente.", origin: "security", owner: "seguridad",
    assumption: "Un contador de sesión por usuario permite revocación inmediata sin almacenar cada token.", validScale: "Una empresa y miles de sesiones; MFA administrativo queda como control adicional antes de ampliar privilegios.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("session_revocation_count", "Sesiones invalidadas por cambios sensibles", "audit_log"), metric("revoked_token_attempt_rate", "Intentos con versiones de sesión antiguas")],
    implementation: ["apps/api/src/application/use-cases/auth.use-cases.ts", "apps/api/src/interfaces/http/authController.ts", "apps/api/src/infrastructure/database/activationTokenRepositories.ts", "apps/api/database/schema.sql"], tests: ["apps/api/src/interfaces/http/authController.test.ts", "apps/api/src/application/use-cases/account-activation.use-cases.test.ts", "apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-GOV-001", description: "Las operaciones económicas de riesgo requieren segregación o un control compensatorio proporcional.", origin: "security", owner: "direccion",
    assumption: "Un único administrador es aceptable solo mientras el volumen no permita separación de funciones.", validScale: "Operación pequeña; los umbrales y el segundo aprobador deben definirse antes de delegar administración.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("same_actor_approval_rate", "Operaciones creadas y aprobadas por el mismo actor"), metric("manual_financial_override_rate", "Sobrescrituras económicas manuales")],
    implementation: ["apps/api/src/application/use-cases/work-tracking.use-cases.ts", "apps/api/src/application/use-cases/sales.use-cases.ts"], tests: ["apps/api/src/application/use-cases/work-tracking.use-cases.test.ts", "apps/api/src/application/use-cases/sales.use-cases.test.ts"],
  },
  {
    id: "HOG-COM-002", description: "Las oportunidades avanzan únicamente por transiciones comerciales válidas y los estados terminales no admiten nuevas propuestas.", origin: "business", owner: "comercial",
    assumption: "Un pipeline lineal cubre la captación actual; crear la primera propuesta inicia el estudio y solo una oportunidad abierta puede firmarse y convertirse en obra.", validScale: "Un equipo comercial; revisar al incorporar responsables, reaperturas o pipelines paralelos.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("opportunity_transition_denial_rate", "Transiciones comerciales rechazadas", "audit_log"), metric("opportunity_reopen_request_rate", "Solicitudes de reapertura manual")],
    implementation: ["apps/api/src/application/use-cases/sales.use-cases.ts"], tests: ["apps/api/src/application/use-cases/sales.use-cases.test.ts"],
  },
  {
    id: "HOG-AUD-001", description: "El registro de auditoría es append-only y excluye secretos y texto libre innecesario.", origin: "security", owner: "seguridad",
    assumption: "La trazabilidad técnica debe resistir modificaciones desde la aplicación.", validScale: "Millones de eventos; requiere archivado cuando se apruebe la política de retención.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("audit_mutation_attempts", "Intentos de modificar el histórico", "audit_log"), metric("audit_persist_failure_rate", "Fallos al persistir eventos")],
    implementation: ["apps/api/database/durable-audit.sql", "apps/api/src/infrastructure/audit/audit.subscriber.ts"], tests: ["apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-PRV-001", description: "Los datos personales se conservan solo durante el plazo aprobado y después se eliminan o anonimizan.", origin: "legal_fiscal", owner: "seguridad",
    assumption: "Los plazos dependen de la finalidad y deben aprobarse con gestor o DPD antes de automatizar borrados.", validScale: "Cualquier escala; la ejecución automática queda bloqueada hasta aprobar la matriz de retención.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("retention_overdue_records", "Registros que superan el plazo aprobado"), metric("retention_job_failure_rate", "Fallos de eliminación o anonimización")],
    externalValidation: "gestor_y_dpd",
    implementation: ["apps/api/database/schema.sql", "apps/web/src/features/legal/components/PrivacyPolicyPage.tsx"], tests: ["apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-OPS-001", description: "Los listados operativos se paginan y agregan en servidor antes de superar su escala validada.", origin: "technical", owner: "operaciones",
    assumption: "Las colecciones completas solo son aceptables durante la fase de bajo volumen.", validScale: "Hasta 500 registros por colección; a partir de ahí la paginación es obligatoria.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("list_response_size", "Elementos devueltos por listado"), metric("list_p95_latency", "Latencia p95 de listados")],
    implementation: ["apps/api/src/infrastructure/database/postgresRepositories.ts"], tests: ["apps/api/src/infrastructure/database/audit-transactions.test.ts"],
  },
  {
    id: "HOG-SLA-001", description: "No se comunica un plazo de respuesta comercial que no esté medido y alertado.", origin: "business", owner: "comercial",
    assumption: "Una promesa de servicio solo es válida si existe responsable, reloj y alerta.", validScale: "Cualquier volumen de solicitudes.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("lead_first_response_minutes", "Minutos hasta el primer contacto"), metric("lead_sla_breach_rate", "Solicitudes fuera del SLA")],
    implementation: ["apps/web/src/features/solicitudes/components/PublicLanding.tsx"], tests: ["apps/web/src/features/solicitudes/solicitudes.validation.test.ts"],
  },
  {
    id: "HOG-RATE-001", description: "Los límites antiabuso se parametrizan, observan y eliminan sus claves al caducar.", origin: "security", owner: "seguridad",
    assumption: "Umbrales distintos por operación son válidos si están centralizados y medidos.", validScale: "Tráfico moderado; revisar al incorporar proxy distribuido o múltiples regiones.", validFrom: "2026-09-20", validUntil: null, nextReview: "2026-12-20",
    metrics: [metric("rate_limit_denial_rate", "Solicitudes denegadas por clase de operación"), metric("expired_rate_key_count", "Claves caducadas pendientes de purga")],
    implementation: ["apps/api/src/application/use-cases/auth.use-cases.ts", "apps/api/src/infrastructure/database/postgresCooldownGate.ts"], tests: ["apps/api/src/application/use-cases/account-activation.use-cases.test.ts"],
  },
] as const satisfies readonly BusinessRuleMetadata[];
