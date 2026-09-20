/**
 * In-memory repository implementations.
 *
 * Swappable with TypeORM/Prisma without touching domain or use-cases.
 * Uses local mutation, so do NOT share across requests in production.
 */

import {
  IUserRepository, IProjectRepository, IAuditRepository, ICatalogRepository, IChangeOrderRepository, IEstimateRepository, IOpportunityRepository,
} from "@reformapro/domain/repositories";
import { CatalogItem, ChangeOrder, Estimate, EstimateVersion, Opportunity, OpportunityStatus, User, Project, AuditEntry, UserRole } from "@reformapro/domain/entities";
import { NotFoundError, ConflictError } from "@reformapro/domain/errors";
import { Money } from "@reformapro/domain/value-objects";

// Hashes are stored ONLY hashed, never plaintext.
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}

type StoredUser = User & { passwordHash: string };

export class InMemoryUserRepository implements IUserRepository {
  private readonly users: StoredUser[] = [];
  private nextId = 1;
  private readonly activationRevisions = new Map<number, number>();
  activationRevision(id: number) { return this.activationRevisions.get(id) ?? 0; }

  constructor(private readonly hasher: PasswordHasher) {}

  async findById(id: number): Promise<User | null> {
    const u = this.users.find(u => u.id === id);
    return u ? this.strip(u) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const u = this.users.find(u => u.email.value.toLowerCase() === email.toLowerCase());
    return u ? this.strip(u) : null;
  }

  async findAll(): Promise<User[]> { return this.users.map(u => this.strip(u)); }

  async findByRole(role: UserRole): Promise<User[]> {
    return this.users.filter(u => u.rol === role).map(u => this.strip(u));
  }

  async save(user: User, passwordHash?: string): Promise<User> {
    const id = user.id || this.nextId++;
    if (user.id && id >= this.nextId) this.nextId = id + 1;
    const stored: StoredUser = { ...user, id, passwordHash: passwordHash ?? "" };
    this.users.push(stored);
    return this.strip(stored);
  }

  async update(id: number, changes: Partial<Omit<User, "id" | "createdAt">>, passwordHash?: string): Promise<User> {
    const idx = this.users.findIndex(u => u.id === id);
    const current = this.users[idx];
    if (!current) throw new NotFoundError("Usuario");
    const merged: StoredUser = { ...current, ...changes };
    if (current.rol === "admin" && current.activo && (!merged.activo || merged.rol !== "admin") && !this.users.some(u => u.id !== id && u.rol === "admin" && u.activo)) throw new ConflictError("Debe quedar un administrador activo");
    if (passwordHash !== undefined) merged.passwordHash = passwordHash;
    if (changes.activo === false || passwordHash !== undefined || changes.rol !== undefined) this.activationRevisions.set(id, this.activationRevision(id) + 1);
    this.users[idx] = merged;
    return this.strip(merged);
  }

  async delete(id: number): Promise<void> {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) throw new NotFoundError("Usuario");
    this.users.splice(idx, 1);
  }

  async verifyPassword(email: string, plaintext: string): Promise<User | null> {
    const u = this.users.find(u => u.email.value.toLowerCase() === email.toLowerCase());
    if (!u) return null;
    const ok = await this.hasher.verify(plaintext, u.passwordHash);
    return ok ? this.strip(u) : null;
  }

  activateAccount(id: number, passwordHash: string): void {
    const user = this.users.find(user => user.id === id);
    if (!user || !["cliente", "profesional"].includes(user.rol)) throw new NotFoundError("Invitación");
    user.passwordHash = passwordHash;
    user.activo = true;
  }

  async updatePassword(id: number, newPasswordHash: string): Promise<void> {
    await this.update(id, {}, newPasswordHash);
  }

  // Never return passwordHash externally
  private strip(u: StoredUser): User {
    const { passwordHash: _, ...rest } = u;
    return rest;
  }
}

export class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects: Project[] = [];
  private nextId = 1;

  async findById(id: number): Promise<Project | null> {
    return this.projects.find(p => p.id === id) ?? null;
  }
  async findByClient(clienteId: number): Promise<Project[]> {
    return this.projects.filter(p => p.clienteId === clienteId);
  }
  async findByProfesional(userId: number): Promise<Project[]> {
    return this.projects.filter(p => p.profesionalesAsignados.some(a => a.userId === userId));
  }
  async findAll(): Promise<Project[]> { return [...this.projects]; }
  async save(project: Project): Promise<Project> {
    const id = project.id || this.nextId++;
    if (project.id && id >= this.nextId) this.nextId = id + 1;
    const stored: Project = { ...project, id };
    this.projects.push(stored);
    return stored;
  }
  async update(id: number, changes: Partial<Omit<Project, "id" | "createdAt">>, expectedRevision?: number): Promise<Project> {
    const idx = this.projects.findIndex(p => p.id === id);
    const current = this.projects[idx];
    if (!current) throw new NotFoundError("Proyecto");
    if (expectedRevision !== undefined && expectedRevision !== (current.revision ?? 0)) throw new ConflictError("La obra ha cambiado. Actualiza los datos antes de guardar.");
    const merged: Project = { ...current, ...changes, revision: (current.revision ?? 0) + 1 };
    this.projects[idx] = merged;
    return merged;
  }
  async delete(id: number): Promise<void> {
    const idx = this.projects.findIndex(p => p.id === id);
    if (idx === -1) throw new NotFoundError("Proyecto");
    this.projects.splice(idx, 1);
  }
}

export class InMemoryOpportunityRepository implements IOpportunityRepository {
  private readonly sources = new Map<number, Promise<Opportunity>>();
  async fromSolicitud(id: number, input: Omit<Opportunity, "id" | "createdAt" | "updatedAt">) {
    let saved = this.sources.get(id);
    if (!saved) { saved = this.save(input); this.sources.set(id, saved); }
    return saved;
  }
  private readonly items: Opportunity[] = []; private nextId = 1;
  async findById(id: number) { return this.items.find(item => item.id === id) ?? null; }
  async findAll(status?: OpportunityStatus) { return this.items.filter(item => !status || item.estado === status).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); }
  async save(item: Omit<Opportunity, "id" | "createdAt" | "updatedAt">) { const now = new Date(); const saved: Opportunity = { ...item, id: this.nextId++, createdAt: now, updatedAt: now }; this.items.push(saved); return saved; }
  async update(id: number, changes: Partial<Omit<Opportunity, "id" | "createdAt" | "updatedAt">>) { const old = await this.findById(id); if (!old) throw new NotFoundError("Oportunidad"); const next = { ...old, ...changes, updatedAt: new Date() }; this.items[this.items.indexOf(old)] = next; return next; }
}

export class InMemoryCatalogRepository implements ICatalogRepository {
  private readonly items: CatalogItem[] = []; private nextId = 1;
  async findAll(includeInactive = false) { return this.items.filter(item => includeInactive || item.active); }
  async findById(id: number) { return this.items.find(item => item.id === id) ?? null; }
  async findByReference(reference: string) { return this.items.find(item => item.reference === reference) ?? null; }
  async save(item: Omit<CatalogItem, "id" | "createdAt" | "updatedAt">) { const now = new Date(); const saved = { ...item, id: this.nextId++, createdAt: now, updatedAt: now }; this.items.push(saved); return saved; }
  async update(id: number, changes: Partial<Pick<CatalogItem, "reference" | "category" | "description" | "unit" | "salePrice" | "vatRate" | "active">>) { const old = await this.findById(id); if (!old) throw new NotFoundError("Partida de catálogo"); const next = { ...old, ...changes, updatedAt: new Date() }; this.items[this.items.indexOf(old)] = next; return next; }
}

export class InMemoryEstimateRepository implements IEstimateRepository {
  async findPage(query: import("@reformapro/domain/repositories").EstimatePageQuery) {
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return (await this.findAll()).filter(item => {
      const version = this.versions.filter(v => v.estimateId === item.id && v.enviadoAt && (v.version === item.versionActual || item.estado === "en_revision")).sort((a,b) => b.version-a.version)[0];
      const state = item.estado === "enviado" && version?.enviadoAt && version.enviadoAt.getTime()+version.snapshot.validezDias*86400000<Date.now() ? "caducado" : item.estado;
      const labels: Record<string,string> = { en_revision:"En revisión",aceptado:"Convertido en proyecto",rechazado:"Cambios solicitados" };
      const title = query.clientId !== undefined && item.estado === "en_revision" ? version?.snapshot.titulo ?? "" : item.titulo;
      const text = normalize(`${item.numero} ${title} ${version?.snapshot.referencia ?? ""} ${labels[state] ?? state}`);
      return (query.clientId === undefined || (item.clienteId === query.clientId && item.estado !== "borrador" && (item.estado !== "en_revision" || !!version))) && (!query.status || state === query.status) && normalize(query.search).trim().split(/\s+/).every(word => text.includes(word));
    })
      .sort((a,b) => b.updatedAt.getTime()-a.updatedAt.getTime() || b.id-a.id).slice(query.page*query.limit,(query.page+1)*query.limit);
  }
  private readonly items: Estimate[] = []; private readonly versions: EstimateVersion[] = []; private nextId = 1; private nextVersionId = 1;
  async findById(id: number) { return this.items.find(item => item.id === id) ?? null; }
  async findAll() { return [...this.items].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); }
  async findByOpportunity(opportunityId: number) { return this.items.filter(item => item.oportunidadId === opportunityId); }
  async save(item: Omit<Estimate, "id" | "createdAt" | "updatedAt">) { const now = new Date(); const saved: Estimate = { ...item, id: this.nextId++, createdAt: now, updatedAt: now }; this.items.push(saved); return saved; }
  async update(id: number, changes: Partial<Pick<Estimate, "titulo" | "estado" | "versionActual" | "borrador" | "motivoRechazo">>) { const old = await this.findById(id); if (!old) throw new NotFoundError("Presupuesto"); const next = { ...old, ...changes, updatedAt: new Date() }; this.items[this.items.indexOf(old)] = next; return next; }
  async saveVersion(item: Omit<EstimateVersion, "id" | "createdAt">) { const saved: EstimateVersion = { ...item, id: this.nextVersionId++, createdAt: new Date() }; this.versions.push(saved); return saved; }
  async findVersions(estimateId: number) { return this.versions.filter(item => item.estimateId === estimateId).sort((a, b) => b.version - a.version); }
  async signVersion(estimateId: number, version: number, firma: Record<string, unknown>, firmadoAt: Date) { const old = this.versions.find(item => item.estimateId === estimateId && item.version === version && !item.firmadoAt); if (!old) throw new NotFoundError("Versión firmable"); const next = { ...old, firma, firmadoAt }; this.versions[this.versions.indexOf(old)] = next; return next; }
}

export class InMemoryChangeOrderRepository implements IChangeOrderRepository {
  constructor(private readonly projects?: IProjectRepository) {}
  private changing = false;
  async transition(id: number, projectId: number, expected: ChangeOrder["estado"], next: ChangeOrder["estado"], _actorId: number) {
    if (this.changing) throw new ConflictError("La orden está siendo actualizada");
    this.changing = true;
    try {
      const item = this.items.find(row => row.id === id && row.projectId === projectId);
      if (!item || item.estado !== expected) throw new ConflictError("La orden ha cambiado o ya fue resuelta");
      if (next === "aprobado") {
        const project = await this.projects?.findById(projectId);
        if (!project || !this.projects) throw new NotFoundError("Proyecto");
        const delta = item.payload.partidas.reduce((sum,line) => sum + line.cantidad*line.precioVentaUnitario*(1-line.descuento/100),0);
        await this.projects.update(projectId, { presupuesto: project.presupuesto.plus(Money.of(Math.round(delta*100)/100)) }, project.revision ?? 0);
      }
      return this.update(id, { estado: next, aprobadoAt: next === "aprobado" ? new Date() : null });
    } finally { this.changing = false; }
  }
  private readonly items: ChangeOrder[] = []; private nextId = 1;
  async findByProject(projectId: number) { return this.items.filter(item => item.projectId === projectId); }
  async save(item: Omit<ChangeOrder, "id" | "createdAt">) { const saved: ChangeOrder = { ...item, id: this.nextId++, createdAt: new Date() }; this.items.push(saved); return saved; }
  async update(id: number, changes: Partial<Pick<ChangeOrder, "estado" | "payload" | "aprobadoAt">>) { const old = this.items.find(item => item.id === id); if (!old) throw new NotFoundError("Orden de cambio"); if (changes.payload && old.estado !== "borrador") throw new ConflictError("Una orden publicada no se puede modificar"); const next = { ...old, ...changes }; this.items[this.items.indexOf(old)] = next; return next; }
}

// In production: Redis with TTL — challenges auto-expire without a cleanup job.
// Here we check `exp` on every get().
export class InMemoryAuditRepository implements IAuditRepository {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    // Append-only: entries are NEVER mutated or removed
    this.entries.push(entry);
  }
  async findAll(opts: {
    page?: number; limit?: number;
    action?: string | null; userId?: number | null;
    from?: Date | null;     to?: Date | null;
  }): Promise<{ items: AuditEntry[]; total: number; page: number; limit: number; pages: number }> {
    const page  = opts.page  ?? 0;
    const limit = opts.limit ?? 50;
    let filtered = [...this.entries].reverse();
    if (opts.action) filtered = filtered.filter(e => e.action === opts.action);
    if (opts.userId) filtered = filtered.filter(e => e.userId === opts.userId);
    if (opts.from)   filtered = filtered.filter(e => e.timestamp >= opts.from!);
    if (opts.to)     filtered = filtered.filter(e => e.timestamp <= opts.to!);
    const total = filtered.length;
    const items = filtered.slice(page * limit, page * limit + limit);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
