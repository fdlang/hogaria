import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  workCostCents,
} from "@reformapro/domain";
import type {
  WorkEntry,
  WorkRate,
  WorkFilters,
  WorkSummary,
  PublicWorkEntry,
  Engagement,
  RateUnit,
} from "@reformapro/domain";
import type {
  IUserRepository,
  IProjectRepository,
} from "@reformapro/domain/repositories";
import type { WorkStore, WorkRepository } from "./work-tracking.ports.js";

export function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new ValidationError("Identificador inválido");
  return value;
}
function number(value: unknown, name: string, max = 1_000_000): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new ValidationError(name + " inválido");
  return value;
}
function text(value: unknown, required = false): string {
  if (value == null && !required) return "";
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    (required && value.trim().length < 3)
  )
    throw new ValidationError("Texto obligatorio o demasiado largo");
  return value.trim();
}
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new ValidationError("Fecha inválida; incluye zona horaria");
  return new Date(value).toISOString();
}
function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ValidationError("Identificador de operación inválido");
  return value;
}
export function publicWork(entry: WorkEntry): PublicWorkEntry {
  const { rate: _rate, approvedCostCents: _cost, ...publicEntry } = entry;
  return publicEntry;
}

export class WorkTrackingUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly projects: IProjectRepository,
    private readonly store: WorkStore,
    private readonly clock = () => new Date(),
  ) {}
  private now() {
    return this.clock().toISOString();
  }
  private async actor(id: number, admin = false) {
    const user = await this.users.findById(positiveId(id));
    if (
      !user?.activo ||
      (admin
        ? user.rol !== "admin"
        : !["admin", "profesional"].includes(user.rol))
    )
      throw new ForbiddenError();
    return user;
  }
  private async professional(id: number) {
    const user = await this.actor(id);
    if (user.rol !== "profesional") throw new ForbiddenError();
    return user;
  }
  private async project(actorId: number, projectId: number) {
    const project = await this.projects.findById(positiveId(projectId));
    if (
      !project ||
      !project.profesionalesAsignados.some((p) => p.userId === actorId)
    )
      throw new ForbiddenError();
    if (!["planificacion", "en_curso"].includes(project.estado))
      throw new ConflictError("La obra no está abierta para registrar trabajo");
    return project;
  }
  private async rate(repo: WorkRepository, id: number, at: string) {
    const rate = (await repo.rates(id)).find((r) => r.effectiveAt <= at);
    if (!rate)
      throw new ConflictError(
        "Administración debe configurar la vinculación y tarifa vigente",
      );
    return rate;
  }
  private async audit(
    repo: WorkRepository,
    actorId: number,
    entry: WorkEntry,
    action: string,
    before: unknown,
    reason = "",
  ) {
    await repo.event({
      id: crypto.randomUUID(),
      professionalId: entry.professionalId,
      entryId: entry.id,
      actorId,
      action,
      at: this.now(),
      reason,
      before,
      after: entry,
    });
  }
  async rates(actorId: number, professionalId: number) {
    await this.actor(actorId, true);
    positiveId(professionalId);
    return this.store.rates(professionalId);
  }
  async configure(
    actorId: number,
    professionalId: number,
    input: Record<string, unknown>,
  ) {
    await this.actor(actorId, true);
    positiveId(professionalId);
    const user = await this.users.findById(professionalId);
    if (!user || user.rol !== "profesional")
      throw new ValidationError("Selecciona un profesional");
    const engagement = input.engagement as Engagement,
      rateUnit = input.rateUnit as RateUnit;
    if (
      !["empleado", "autonomo", "subcontrata"].includes(engagement) ||
      !["hora", "jornada", "unidad"].includes(rateUnit) ||
      (engagement === "empleado" && rateUnit !== "hora")
    )
      throw new ValidationError("Vinculación o unidad de tarifa inválida");
    const rateCents = number(input.rateCents, "Coste", 100_000_000);
    if (!Number.isInteger(rateCents))
      throw new ValidationError("El coste debe expresarse en céntimos");
    const effectiveAt = input.effectiveAt
      ? date(input.effectiveAt)
      : this.now();
    const reason = text(input.reason, true);
    const unitLabel = rateUnit === "unidad" ? text(input.unitLabel) : rateUnit;
    if (!unitLabel || unitLabel.length > 80)
      throw new ValidationError("Indica una unidad de hasta 80 caracteres");
    const rate: WorkRate = {
      id: crypto.randomUUID(),
      professionalId,
      engagement,
      rateUnit,
      rateCents,
      unitLabel,
      effectiveAt,
      createdAt: this.now(),
    };
    return this.store.transaction(professionalId, async (repo) => {
      if (await repo.openEntry(professionalId))
        throw new ConflictError("Cierra la jornada antes de cambiar la tarifa");
      const rates = await repo.rates(professionalId);
      if (rates.some((r) => r.effectiveAt >= effectiveAt))
        throw new ConflictError(
          "La nueva vigencia debe ser posterior a las tarifas existentes",
        );
      if (rates.length && input.effectiveAt && effectiveAt < this.now())
        throw new ValidationError(
          "Los cambios de tarifa no pueden ser retroactivos",
        );
      await repo.addRate(rate);
      await repo.event({
        id: crypto.randomUUID(),
        professionalId,
        entryId: null,
        actorId,
        action: "tarifa_creada",
        at: this.now(),
        reason,
        before: null,
        after: rate,
      });
      return rate;
    });
  }
  async current(actorId: number) {
    await this.professional(actorId);
    const rates = await this.store.rates(actorId),
      rate = rates.find((r) => r.effectiveAt <= this.now());
    const open = await this.store.openEntry(actorId);
    return {
      engagement: rate?.engagement ?? null,
      rateUnit: rate?.rateUnit ?? null,
      unitLabel: rate?.unitLabel ?? null,
      open: open ? publicWork(open) : null,
    };
  }
  async start(actorId: number, input: Record<string, unknown>) {
    const user = await this.professional(actorId),
      project = await this.project(actorId, positiveId(input.projectId));
    const id = uuid(input.operationId);
    return this.store.transaction(actorId, async (repo) => {
      const existing = await repo.entry(id);
      if (existing) {
        if (
          existing.professionalId !== actorId ||
          existing.projectId !== project.id ||
          existing.kind !== "jornada"
        )
          throw new ConflictError("Operación ya utilizada");
        return publicWork(existing);
      }
      if (await repo.openEntry(actorId))
        throw new ConflictError("Ya tienes una jornada abierta");
      const at = this.now(),
        rate = await this.rate(repo, actorId, at);
      if (rate.engagement !== "empleado")
        throw new ValidationError(
          "Los colaboradores registran partes de trabajo",
        );
      if (await repo.overlaps(actorId, at, null, id))
        throw new ConflictError("El horario se solapa con otro registro");
      const entry: WorkEntry = {
        id,
        professionalId: actorId,
        professionalName: user.nombre,
        profession: user.profesion ?? "",
        projectId: project.id,
        projectName: project.nombre,
        kind: "jornada",
        startedAt: at,
        endedAt: null,
        pauses: [],
        breakSeconds: 0,
        units: null,
        unitLabel: "hora",
        rate,
        notes: "",
        status: "abierto",
        revision: 1,
        approvedCostCents: null,
        approvedAt: null,
        approvedBy: null,
        reviewReason: "",
        createdAt: at,
      };
      await repo.putEntry(entry);
      await this.audit(repo, actorId, entry, "entrada", null);
      return publicWork(entry);
    });
  }
  async action(
    actorId: number,
    entryId: string,
    input: Record<string, unknown>,
  ) {
    const actor = await this.actor(actorId);
    uuid(entryId);
    const original = await this.store.entry(entryId);
    if (
      !original ||
      (actor.rol !== "admin" && original.professionalId !== actorId)
    )
      throw new NotFoundError("Registro");
    return this.store.transaction(original.professionalId, async (repo) => {
      const entry = await repo.entry(entryId);
      if (!entry) throw new NotFoundError("Registro");
      if (input.revision !== entry.revision)
        throw new ConflictError(
          "El registro ha cambiado. Actualiza y vuelve a intentarlo",
        );
      const before = structuredClone(entry),
        at = this.now(),
        action = input.action;
      let reason = "";
      if (["pausa", "reanudar", "salida"].includes(String(action))) {
        if (
          actor.rol !== "profesional" ||
          entry.professionalId !== actorId ||
          entry.status !== "abierto"
        )
          throw new ForbiddenError();
        const pause = entry.pauses.find((p) => !p.endedAt);
        if (action === "pausa") {
          if (pause) throw new ConflictError("Ya hay una pausa abierta");
          if (entry.pauses.length >= 100)
            throw new ConflictError(
              "Límite de pausas alcanzado; cierra la jornada",
            );
          entry.pauses.push({ startedAt: at, endedAt: null });
        }
        if (action === "reanudar") {
          if (!pause) throw new ConflictError("No hay pausa abierta");
          pause.endedAt = at;
        }
        if (action === "salida") {
          const duration = Date.parse(at) - Date.parse(entry.startedAt);
          if (duration <= 0 || duration > 7 * 86400 * 1000)
            throw new ConflictError(
              "La duración no es válida. Solicita a administración una corrección si olvidaste fichar",
            );
          if (pause) pause.endedAt = at;
          entry.endedAt = at;
          entry.notes = text(input.notes);
          entry.status = "enviado";
        }
      } else if (action === "corregir") {
        if (actor.rol !== "admin") throw new ForbiddenError();
        reason = text(input.reason, true);
        this.interval(input, entry);
        if (
          await repo.overlaps(
            entry.professionalId,
            entry.startedAt,
            entry.endedAt,
            entry.id,
          )
        )
          throw new ConflictError("El horario se solapa con otro registro");
        entry.status = "enviado";
        entry.approvedCostCents = null;
        entry.approvedAt = null;
        entry.approvedBy = null;
        entry.reviewReason = reason;
      } else if (action === "aprobar" || action === "rechazar") {
        if (actor.rol !== "admin") throw new ForbiddenError();
        if (entry.status !== "enviado" || !entry.endedAt)
          throw new ConflictError("Solo se pueden revisar registros enviados");
        reason = action === "rechazar" ? text(input.reason, true) : "";
        entry.status = action === "aprobar" ? "aprobado" : "rechazado";
        entry.approvedCostCents =
          action === "aprobar" ? workCostCents(entry) : null;
        entry.approvedBy = actorId;
        entry.approvedAt = at;
        entry.reviewReason = reason;
      } else throw new ValidationError("Acción inválida");
      entry.revision++;
      await repo.putEntry(entry);
      await this.audit(repo, actorId, entry, String(action), before, reason);
      return actor.rol === "admin" ? entry : publicWork(entry);
    });
  }
  private interval(input: Record<string, unknown>, entry: WorkEntry) {
    const start = date(input.startedAt),
      end = date(input.endedAt);
    if (start < entry.rate.effectiveAt)
      throw new ValidationError(
        "El inicio no puede preceder a la vigencia de la tarifa de origen",
      );
    const duration = (Date.parse(end) - Date.parse(start)) / 1000;
    if (duration <= 0 || duration > 7 * 86400 || end > this.now())
      throw new ValidationError(
        "El intervalo debe ser pasado, positivo y de hasta siete días",
      );
    const rawBreakSeconds =
      input.breakSeconds !== undefined
        ? number(input.breakSeconds, "Pausa", duration)
        : number(input.breakMinutes ?? 0, "Pausa", duration / 60) * 60;
    const breakSeconds = Math.round(rawBreakSeconds * 1000) / 1000;
    if (breakSeconds >= duration)
      throw new ValidationError(
        "Las pausas deben ser menores que el intervalo",
      );
    const units =
      entry.rate.rateUnit === "hora"
        ? null
        : number(input.units, "Cantidad", 100_000);
    if (
      units !== null &&
      (units <= 0 || Math.abs(units * 1000 - Math.round(units * 1000)) > 1e-7)
    )
      throw new ValidationError("Cantidad positiva con hasta tres decimales");
    entry.startedAt = start;
    entry.endedAt = end;
    entry.pauses = [];
    entry.breakSeconds = breakSeconds;
    entry.units = units;
    entry.notes = text(input.notes);
  }
  async part(actorId: number, input: Record<string, unknown>) {
    const user = await this.professional(actorId),
      project = await this.project(actorId, positiveId(input.projectId));
    const id = uuid(input.operationId),
      startedAt = date(input.startedAt);
    return this.store.transaction(actorId, async (repo) => {
      const existing = await repo.entry(id);
      if (existing) {
        if (
          existing.professionalId !== actorId ||
          existing.projectId !== project.id ||
          existing.kind !== "parte"
        )
          throw new ConflictError("Operación ya utilizada");
        return publicWork(existing);
      }
      const rate = await this.rate(repo, actorId, startedAt);
      if (rate.engagement === "empleado")
        throw new ValidationError(
          "Los empleados utilizan el fichaje de jornada",
        );
      const entry: WorkEntry = {
        id,
        professionalId: actorId,
        professionalName: user.nombre,
        profession: user.profesion ?? "",
        projectId: project.id,
        projectName: project.nombre,
        kind: "parte",
        startedAt,
        endedAt: null,
        pauses: [],
        breakSeconds: 0,
        units: null,
        unitLabel: rate.unitLabel,
        rate,
        notes: "",
        status: "enviado",
        revision: 1,
        approvedCostCents: null,
        approvedAt: null,
        approvedBy: null,
        reviewReason: "",
        createdAt: this.now(),
      };
      this.interval(input, entry);
      if (
        await repo.overlaps(actorId, entry.startedAt, entry.endedAt, entry.id)
      )
        throw new ConflictError("El horario se solapa con otro registro");
      await repo.putEntry(entry);
      await this.audit(repo, actorId, entry, "parte_enviado", null);
      return publicWork(entry);
    });
  }
  async list(actorId: number, input: Record<string, unknown>) {
    const actor = await this.actor(actorId);
    const filters: WorkFilters = {
      page: number(input.page ?? 0, "Página", 100000),
    };
    if (!Number.isInteger(filters.page))
      throw new ValidationError("Página inválida");
    if (input.projectId != null)
      filters.projectId = positiveId(input.projectId);
    if (actor.rol !== "admin") filters.professionalId = actorId;
    else if (input.professionalId != null)
      filters.professionalId = positiveId(input.professionalId);
    if (input.from) filters.from = date(input.from);
    if (input.to) filters.to = date(input.to);
    if (filters.from && filters.to && filters.from > filters.to)
      throw new ValidationError("Rango inválido");
    if (input.status) {
      if (
        !["abierto", "enviado", "aprobado", "rechazado"].includes(
          String(input.status),
        )
      )
        throw new ValidationError("Estado inválido");
      filters.status = input.status as NonNullable<WorkFilters["status"]>;
    }
    const result = await this.store.list(filters);
    return {
      ...result,
      page: filters.page,
      pageSize: 50,
      items: result.items.map((e) =>
        actor.rol === "admin" ? e : publicWork(e),
      ),
    };
  }
  async history(actorId: number, entryId: string) {
    const actor = await this.actor(actorId),
      entry = await this.store.entry(uuid(entryId));
    if (!entry || (actor.rol !== "admin" && entry.professionalId !== actorId))
      throw new NotFoundError("Registro");
    const events = await this.store.events(entryId);
    return actor.rol === "admin"
      ? events
      : events.map(({ before, after, ...event }) => ({
          ...event,
          before: before ? publicWork(before as WorkEntry) : null,
          after: after ? publicWork(after as WorkEntry) : null,
        }));
  }
  async auditLog(actorId: number, page: number) {
    await this.actor(actorId, true);
    number(page, "Página", 100000);
    if (!Number.isInteger(page)) throw new ValidationError("Página inválida");
    return this.store.audit(page);
  }
  async budget(
    actorId: number,
    projectId: number,
    input: Record<string, unknown>,
  ) {
    await this.actor(actorId, true);
    positiveId(projectId);
    if (!(await this.projects.findById(projectId)))
      throw new NotFoundError("Proyecto");
    const plannedHours = number(input.plannedHours, "Horas"),
      plannedCostCents = number(input.plannedCostCents, "Coste", 1_000_000_000);
    if (!Number.isInteger(plannedCostCents))
      throw new ValidationError("Coste en céntimos");
    const reason = text(input.reason, true);
    return this.store.transaction(-projectId, async (repo) => {
      const before = await repo.budget(projectId),
        after = { projectId, plannedHours, plannedCostCents };
      await repo.budget(projectId, after);
      await repo.event({
        id: crypto.randomUUID(),
        professionalId: actorId,
        entryId: null,
        actorId,
        action: "prevision_actualizada",
        at: this.now(),
        reason,
        before,
        after,
      });
      return after;
    });
  }
  async summary(actorId: number, projectId: number): Promise<WorkSummary> {
    await this.actor(actorId, true);
    positiveId(projectId);
    if (!(await this.projects.findById(projectId)))
      throw new NotFoundError("Proyecto");
    const totals = await this.store.summary(projectId),
      budget = await this.store.budget(projectId);
    return {
      ...totals,
      projectId,
      budget,
      hoursDeviation: budget
        ? totals.approvedHours - budget.plannedHours
        : null,
      costDeviationCents: budget
        ? totals.approvedCostCents - budget.plannedCostCents
        : null,
    };
  }
}
