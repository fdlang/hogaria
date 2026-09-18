/**
 * In-memory repository implementations.
 *
 * Swappable with TypeORM/Prisma without touching domain or use-cases.
 * Uses local mutation, so do NOT share across requests in production.
 */

import {
  IUserRepository, IProjectRepository, IBudgetRepository,
  IChallengeRepository, IAuditRepository, IChangeOrderRepository, IEstimateRepository, IOpportunityRepository, Challenge,
} from "@reformapro/domain/repositories";
import { ChangeOrder, Estimate, EstimateVersion, Opportunity, OpportunityStatus, User, Project, Budget, AuditEntry, UserRole } from "@reformapro/domain/entities";
import { NotFoundError } from "@reformapro/domain/errors";

// Hashes are stored ONLY hashed, never plaintext.
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}

type StoredUser = User & { passwordHash: string };

export class InMemoryUserRepository implements IUserRepository {
  private readonly users: StoredUser[] = [];
  private nextId = 1;

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

  async update(id: number, changes: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const idx = this.users.findIndex(u => u.id === id);
    const current = this.users[idx];
    if (!current) throw new NotFoundError("Usuario");
    const merged: StoredUser = { ...current, ...changes };
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

  async updatePassword(id: number, newPasswordHash: string): Promise<void> {
    const idx = this.users.findIndex(u => u.id === id);
    const current = this.users[idx];
    if (!current) throw new NotFoundError("Usuario");
    this.users[idx] = { ...current, passwordHash: newPasswordHash };
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
  async update(id: number, changes: Partial<Omit<Project, "id" | "createdAt">>): Promise<Project> {
    const idx = this.projects.findIndex(p => p.id === id);
    const current = this.projects[idx];
    if (!current) throw new NotFoundError("Proyecto");
    const merged: Project = { ...current, ...changes };
    this.projects[idx] = merged;
    return merged;
  }
  async delete(id: number): Promise<void> {
    const idx = this.projects.findIndex(p => p.id === id);
    if (idx === -1) throw new NotFoundError("Proyecto");
    this.projects.splice(idx, 1);
  }
}

export class InMemoryBudgetRepository implements IBudgetRepository {
  private readonly budgets: Budget[] = [];
  private nextId = 1;

  async findById(id: number): Promise<Budget | null> {
    return this.budgets.find(b => b.id === id) ?? null;
  }
  async findByProject(proyectoId: number): Promise<Budget[]> {
    return this.budgets.filter(b => b.proyectoId === proyectoId);
  }
  async findByClient(clienteId: number): Promise<Budget[]> {
    return this.budgets.filter(b => b.clienteId === clienteId);
  }
  async findAll(): Promise<Budget[]> { return [...this.budgets]; }
  async save(budget: Budget): Promise<Budget> {
    const id = budget.id || this.nextId++;
    if (budget.id && id >= this.nextId) this.nextId = id + 1;
    // Preserve the prototype chain (Budget has methods like isSignable())
    const stored = Object.assign(Object.create(Object.getPrototypeOf(budget)), budget, { id }) as Budget;
    this.budgets.push(stored);
    return stored;
  }
  async update(id: number, changes: Partial<Budget>): Promise<Budget> {
    const idx = this.budgets.findIndex(b => b.id === id);
    const current = this.budgets[idx];
    if (!current) throw new NotFoundError("Presupuesto");
    const merged = Object.assign(Object.create(Object.getPrototypeOf(current)), current, changes) as Budget;
    this.budgets[idx] = merged;
    return merged;
  }
  async delete(id: number): Promise<void> {
    const idx = this.budgets.findIndex(b => b.id === id);
    if (idx === -1) throw new NotFoundError("Presupuesto");
    this.budgets.splice(idx, 1);
  }
}

export class InMemoryOpportunityRepository implements IOpportunityRepository {
  private readonly items: Opportunity[] = []; private nextId = 1;
  async findById(id: number) { return this.items.find(item => item.id === id) ?? null; }
  async findAll(status?: OpportunityStatus) { return this.items.filter(item => !status || item.estado === status).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); }
  async save(item: Omit<Opportunity, "id" | "createdAt" | "updatedAt">) { const now = new Date(); const saved: Opportunity = { ...item, id: this.nextId++, createdAt: now, updatedAt: now }; this.items.push(saved); return saved; }
  async update(id: number, changes: Partial<Omit<Opportunity, "id" | "createdAt" | "updatedAt">>) { const old = await this.findById(id); if (!old) throw new NotFoundError("Oportunidad"); const next = { ...old, ...changes, updatedAt: new Date() }; this.items[this.items.indexOf(old)] = next; return next; }
}

export class InMemoryEstimateRepository implements IEstimateRepository {
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
  private readonly items: ChangeOrder[] = []; private nextId = 1;
  async findByProject(projectId: number) { return this.items.filter(item => item.projectId === projectId); }
  async save(item: Omit<ChangeOrder, "id" | "createdAt">) { const saved: ChangeOrder = { ...item, id: this.nextId++, createdAt: new Date() }; this.items.push(saved); return saved; }
  async update(id: number, changes: Partial<Pick<ChangeOrder, "estado" | "payload" | "aprobadoAt">>) { const old = this.items.find(item => item.id === id); if (!old) throw new NotFoundError("Orden de cambio"); const next = { ...old, ...changes }; this.items[this.items.indexOf(old)] = next; return next; }
}

// In production: Redis with TTL — challenges auto-expire without a cleanup job.
// Here we check `exp` on every get().
export class InMemoryChallengeRepository implements IChallengeRepository {
  private readonly challenges = new Map<number, Challenge>();

  async get(budgetId: number): Promise<Challenge | null> {
    const c = this.challenges.get(budgetId);
    if (!c) return null;
    if (Date.now() > c.exp) { this.challenges.delete(budgetId); return null; }
    return c;
  }
  async set(budgetId: number, challenge: Challenge): Promise<void> {
    this.challenges.set(budgetId, challenge);
  }
  async delete(budgetId: number): Promise<void> {
    this.challenges.delete(budgetId);
  }
}

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
