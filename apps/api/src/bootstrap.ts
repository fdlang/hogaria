/**
 * API composition root.
 *
 * This is where concrete implementations meet interfaces.
 * To add a new dependency: wire it up here, pass it to the use-case constructor.
 *
 * To swap an implementation (e.g. memory → Postgres): change ONE line here.
 */

import {
  InMemoryUserRepository, InMemoryProjectRepository, InMemoryCatalogRepository, InMemoryOpportunityRepository, InMemoryEstimateRepository, InMemoryChangeOrderRepository,
  InMemoryAuditRepository,
} from "./infrastructure/database/inMemoryRepositories.js";
import { BcryptPasswordHasher } from "./infrastructure/database/passwordHasher.js";
import bcrypt from "bcryptjs";
import {
  HMACKeyProvider, WebCryptoTokenService, WebCryptoSignatureService,
  generateTempPassword,
} from "./infrastructure/crypto/crypto.service.js";
import { InMemoryEventEmitter } from "./infrastructure/events/inMemoryEventEmitter.js";
import { AuditSubscriber }       from "./infrastructure/audit/audit.subscriber.js";

import { LoginUseCase } from "./application/use-cases/auth.use-cases.js";
import {
  CreateUserUseCase, UpdateUserUseCase, DeleteUserUseCase, ListUsersUseCase,
} from "./application/use-cases/user.use-cases.js";
import {
  AssignProjectProfessionalUseCase, DeleteProjectUseCase, GetProjectUseCase, ListProjectsUseCase, UnassignProjectProfessionalUseCase, UpdateProjectUseCase,
} from "./application/use-cases/project.use-cases.js";
import { QueryAuditLogUseCase } from "./application/use-cases/audit.use-cases.js";
import {
  ListSolicitudesUseCase, SubmitSolicitudUseCase, UpdateSolicitudStatusUseCase,
  InMemoryCooldownGate, ISolicitudRepository, Solicitud,
} from "./application/use-cases/solicitud.use-cases.js";
import {
  DownloadFileUseCase, UploadFileUseCase, DeleteFileUseCase, ListFilesUseCase,
  IFileRepository, IFileStorage, ProjectFile,
} from "./application/use-cases/file.use-cases.js";
import { VercelBlobFileStorage } from "./infrastructure/storage/vercelBlobFileStorage.js";
import { ChangeOrderUseCases, EstimateUseCases, OpportunityUseCases } from "./application/use-cases/sales.use-cases.js";
import { CatalogUseCases } from "./application/use-cases/catalog.use-cases.js";
import { AccountActivationUseCases, configureActivationPasswordHasher, IActivationTokenRepository } from "./application/use-cases/account-activation.use-cases.js";
import { InMemoryActivationTokenRepository, PostgresActivationTokenRepository } from "./infrastructure/database/activationTokenRepositories.js";
import { ResendTransactionalEmail } from "./infrastructure/email/resendTransactionalEmail.js";
import { NotFoundError } from "@reformapro/domain/errors";
import { Email } from "@reformapro/domain/value-objects";
import { IAuditRepository, ICatalogRepository, IChangeOrderRepository, IEstimateRepository, IOpportunityRepository, IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import { PostgresAuditRepository, PostgresCatalogRepository, PostgresChangeOrderRepository, PostgresEstimateRepository, PostgresFileRepository, PostgresOpportunityRepository, PostgresProjectRepository, PostgresSolicitudRepository, PostgresUserRepository } from "./infrastructure/database/postgresRepositories.js";
import pg from "pg";
import { PostgresCooldownGate } from "./infrastructure/database/postgresCooldownGate.js";
import { PostgresCommercialTransaction } from "./infrastructure/database/postgresCommercialTransaction.js";

// ─────────────────────────────────────────────────────────────
// Tiny in-memory implementations for repos that don't have one yet
// ─────────────────────────────────────────────────────────────
class InMemorySolicitudRepository implements ISolicitudRepository {
  private readonly items: Solicitud[] = [];
  private nextId = 1;
  async save(s: Omit<Solicitud, "id" | "motivo">): Promise<{ id: number }> {
    const id = this.nextId++;
    this.items.push({ ...s, id, motivo: null });
    return { id };
  }
  async findAll(): Promise<Solicitud[]> { return [...this.items].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()); }
  async findById(id: number): Promise<Solicitud | null> { return this.items.find(item => item.id === id) ?? null; }
  async update(id: number, changes: Pick<Solicitud, "estado" | "motivo">): Promise<Solicitud> {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) throw new NotFoundError("Solicitud");
    const next = { ...this.items[index]!, ...changes };
    this.items[index] = next;
    return next;
  }
}

class InMemoryFileRepository implements IFileRepository {
  private readonly files: ProjectFile[] = [];
  private nextId = 1;
  async save(f: Omit<ProjectFile, "id">): Promise<ProjectFile> {
    const file = { ...f, id: this.nextId++ };
    this.files.push(file);
    return file;
  }
  async findById(id: number): Promise<ProjectFile | null> {
    return this.files.find(f => f.id === id) ?? null;
  }
  async findByProject(projectId: number): Promise<ProjectFile[]> {
    return this.files.filter(f => f.projectId === projectId);
  }
  async delete(id: number): Promise<void> {
    const idx = this.files.findIndex(f => f.id === id);
    if (idx === -1) throw new NotFoundError("Archivo");
    this.files.splice(idx, 1);
  }
}

// ─────────────────────────────────────────────────────────────
// AppDependencies
// ─────────────────────────────────────────────────────────────
export interface AppDependencies {
  users:        IUserRepository;
  projects:     IProjectRepository;
  audit:        IAuditRepository;
  events:       InMemoryEventEmitter;
  tokens:       WebCryptoTokenService;
  files:        IFileRepository;
  solicitudes:  ISolicitudRepository;
  opportunities: IOpportunityRepository;
  estimates: IEstimateRepository;
  changes: IChangeOrderRepository;
  catalog: ICatalogRepository;

  useCases: {
    login:                     LoginUseCase;
    createUser:                CreateUserUseCase;
    updateUser:                UpdateUserUseCase;
    deleteUser:                DeleteUserUseCase;
    listUsers:                 ListUsersUseCase;
    updateProject:             UpdateProjectUseCase;
    deleteProject:             DeleteProjectUseCase;
    listProjects:              ListProjectsUseCase;
    getProject:                GetProjectUseCase;
    assignProjectProfessional: AssignProjectProfessionalUseCase;
    unassignProjectProfessional: UnassignProjectProfessionalUseCase;
    queryAuditLog:             QueryAuditLogUseCase;
    submitSolicitud:           SubmitSolicitudUseCase;
    listSolicitudes:           ListSolicitudesUseCase;
    updateSolicitudStatus:     UpdateSolicitudStatusUseCase;
    uploadFile:                UploadFileUseCase;
    deleteFile:                DeleteFileUseCase;
    listFiles:                 ListFilesUseCase;
    downloadFile:              DownloadFileUseCase;
    opportunities:             OpportunityUseCases;
    estimates:                 EstimateUseCases;
    changes:                   ChangeOrderUseCases;
    catalog:                   CatalogUseCases;
    activation:                AccountActivationUseCases;
  };
}

export async function buildApp(): Promise<AppDependencies> {
  // ── Infrastructure ───────────────────────────────────────────
  const hasher = new BcryptPasswordHasher(bcrypt, 12);
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const databaseUrl = process.env.DATABASE_URL;
  const hmacSecret = process.env.HMAC_SECRET;
  if (isProduction && !databaseUrl) throw new Error("DATABASE_URL es obligatoria en producción");
  if (isProduction && (!hmacSecret || hmacSecret.length < 32)) throw new Error("HMAC_SECRET debe tener al menos 32 caracteres en producción");

  const hmacKeys  = new HMACKeyProvider(hmacSecret);
  const tokens    = new WebCryptoTokenService(hmacKeys);
  const sigCrypto = new WebCryptoSignatureService(hmacKeys);
  const events    = new InMemoryEventEmitter();
  const memoryCooldown = new InMemoryCooldownGate();

  const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
  const cooldown = pool ? new PostgresCooldownGate(pool) : memoryCooldown;
  const users: IUserRepository = pool ? new PostgresUserRepository(pool, hasher) : new InMemoryUserRepository(hasher);
  const projects: IProjectRepository = pool ? new PostgresProjectRepository(pool) : new InMemoryProjectRepository();
  const audit: IAuditRepository = pool ? new PostgresAuditRepository(pool) : new InMemoryAuditRepository();
  const files: IFileRepository = pool ? new PostgresFileRepository(pool) : new InMemoryFileRepository();
  const fileStorage: IFileStorage = new VercelBlobFileStorage();
  const solicitudes: ISolicitudRepository = pool ? new PostgresSolicitudRepository(pool) : new InMemorySolicitudRepository();
  const opportunities: IOpportunityRepository = pool ? new PostgresOpportunityRepository(pool) : new InMemoryOpportunityRepository();
  const estimates: IEstimateRepository = pool ? new PostgresEstimateRepository(pool) : new InMemoryEstimateRepository();
  const changes: IChangeOrderRepository = pool ? new PostgresChangeOrderRepository(pool) : new InMemoryChangeOrderRepository();
  const catalog: ICatalogRepository = pool ? new PostgresCatalogRepository(pool) : new InMemoryCatalogRepository();
  const activationTokens: IActivationTokenRepository = pool ? new PostgresActivationTokenRepository(pool) : new InMemoryActivationTokenRepository();
  configureActivationPasswordHasher(value => hasher.hash(value));
  const activation = new AccountActivationUseCases(users, activationTokens, new ResendTransactionalEmail(process.env.RESEND_API_KEY, process.env.EMAIL_FROM), process.env.APP_URL ?? "http://localhost:5173");

  // Development seed. PostgreSQL deployments use the same credentials only
  // during the first bootstrap; override all values through environment vars.
  const seedEmail = process.env.SEED_ADMIN_EMAIL ?? (isProduction ? undefined : "admin@reformapro.local");
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? undefined : "ChangeMe_123!");
  if (seedEmail && seedPassword && !(await users.findByEmail(seedEmail))) {
    await users.save({
      id: 1,
      email: Email.of(seedEmail),
      nombre: process.env.SEED_ADMIN_NAME ?? "Administrador Hogaria",
      rol: "admin",
      activo: true,
      createdAt: new Date(),
    }, await hasher.hash(seedPassword));
  }

  // ── Cross-cutting: audit subscriber ───────────────────────────
  const auditor = new AuditSubscriber(events, audit);
  auditor.start();

  // ── Use cases ──────────────────────────────────────────────────
  const useCases = {
    login:                      new LoginUseCase(users, tokens, events, cooldown),
    createUser:                 new CreateUserUseCase(users, hasher, generateTempPassword, events, activation),
    updateUser:                 new UpdateUserUseCase(users, hasher, events),
    deleteUser:                 new DeleteUserUseCase(users, events),
    listUsers:                  new ListUsersUseCase(users),
    updateProject:              new UpdateProjectUseCase(users, projects, events),
    deleteProject:              new DeleteProjectUseCase(users, projects),
    listProjects:               new ListProjectsUseCase(users, projects),
    getProject:                 new GetProjectUseCase(users, projects),
    assignProjectProfessional:  new AssignProjectProfessionalUseCase(users, projects),
    unassignProjectProfessional:new UnassignProjectProfessionalUseCase(users, projects),
    queryAuditLog:              new QueryAuditLogUseCase(users, audit),
    submitSolicitud:            new SubmitSolicitudUseCase(solicitudes, cooldown),
    listSolicitudes:            new ListSolicitudesUseCase(users, solicitudes),
    updateSolicitudStatus:      new UpdateSolicitudStatusUseCase(users, solicitudes),
    uploadFile:                 new UploadFileUseCase(users, projects, files, fileStorage, events),
    deleteFile:                 new DeleteFileUseCase(users, projects, files, fileStorage),
    listFiles:                  new ListFilesUseCase(users, projects, files),
    downloadFile:               new DownloadFileUseCase(users, projects, files, fileStorage),
    opportunities:              new OpportunityUseCases(users, opportunities, events),
    estimates:                  new EstimateUseCases(users, opportunities, estimates, projects, events, sigCrypto, pool ? new PostgresCommercialTransaction(pool) : undefined),
    changes:                    new ChangeOrderUseCases(users, projects, changes),
    catalog:                    new CatalogUseCases(users, catalog),
    activation,
  };

  return { users, projects, audit, events, tokens, files, solicitudes, opportunities, estimates, changes, catalog, useCases };
}
