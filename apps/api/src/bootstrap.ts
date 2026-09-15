/**
 * API composition root.
 *
 * This is where concrete implementations meet interfaces.
 * To add a new dependency: wire it up here, pass it to the use-case constructor.
 *
 * To swap an implementation (e.g. memory → Postgres): change ONE line here.
 */

import {
  InMemoryUserRepository, InMemoryProjectRepository, InMemoryBudgetRepository,
  InMemoryChallengeRepository, InMemoryAuditRepository,
} from "./infrastructure/database/inMemoryRepositories.js";
import { PlainPasswordHasher } from "./infrastructure/database/passwordHasher.js";
import {
  HMACKeyProvider, WebCryptoTokenService, WebCryptoSignatureService,
  generateTempPassword,
} from "./infrastructure/crypto/crypto.service.js";
import { InMemoryEventEmitter } from "./infrastructure/events/inMemoryEventEmitter.js";
import { AuditSubscriber }       from "./infrastructure/audit/audit.subscriber.js";

import { LoginUseCase } from "./application/use-cases/auth.use-cases.js";
import {
  CreateBudgetUseCase, SendBudgetUseCase, DeleteBudgetUseCase,
  ListBudgetsUseCase, RequestSignatureChallengeUseCase,
} from "./application/use-cases/budget.use-cases.js";
import { SignBudgetUseCase } from "./application/use-cases/sign-budget.use-case.js";
import {
  CreateUserUseCase, UpdateUserUseCase, DeleteUserUseCase, ListUsersUseCase,
} from "./application/use-cases/user.use-cases.js";
import {
  CreateProjectUseCase, UpdateProjectUseCase, DeleteProjectUseCase, ListProjectsUseCase,
} from "./application/use-cases/project.use-cases.js";
import { QueryAuditLogUseCase } from "./application/use-cases/audit.use-cases.js";
import {
  SubmitSolicitudUseCase, InMemoryCooldownGate, ISolicitudRepository,
} from "./application/use-cases/solicitud.use-cases.js";
import {
  UploadFileUseCase, DeleteFileUseCase, ListFilesUseCase,
  IFileRepository, ProjectFile,
} from "./application/use-cases/file.use-cases.js";
import { NotFoundError } from "@reformapro/domain/errors";

// ─────────────────────────────────────────────────────────────
// Tiny in-memory implementations for repos that don't have one yet
// ─────────────────────────────────────────────────────────────
class InMemorySolicitudRepository implements ISolicitudRepository {
  private readonly items: Array<{ id: number; nombre: string; email: string; telefono: string; tipo: string; descripcion: string; fecha: Date; estado: "pendiente"; ip: string }> = [];
  private nextId = 1;
  async save(s: Omit<typeof this.items[number], "id">): Promise<{ id: number }> {
    const id = this.nextId++;
    this.items.push({ ...s, id });
    return { id };
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
  users:        InMemoryUserRepository;
  projects:     InMemoryProjectRepository;
  budgets:      InMemoryBudgetRepository;
  challenges:   InMemoryChallengeRepository;
  audit:        InMemoryAuditRepository;
  events:       InMemoryEventEmitter;
  tokens:       WebCryptoTokenService;
  signatureCrypto: WebCryptoSignatureService;
  files:        InMemoryFileRepository;
  solicitudes:  InMemorySolicitudRepository;

  useCases: {
    login:                     LoginUseCase;
    createBudget:              CreateBudgetUseCase;
    sendBudget:                SendBudgetUseCase;
    deleteBudget:              DeleteBudgetUseCase;
    listBudgets:               ListBudgetsUseCase;
    requestSignatureChallenge: RequestSignatureChallengeUseCase;
    signBudget:                SignBudgetUseCase;
    createUser:                CreateUserUseCase;
    updateUser:                UpdateUserUseCase;
    deleteUser:                DeleteUserUseCase;
    listUsers:                 ListUsersUseCase;
    createProject:             CreateProjectUseCase;
    updateProject:             UpdateProjectUseCase;
    deleteProject:             DeleteProjectUseCase;
    listProjects:              ListProjectsUseCase;
    queryAuditLog:             QueryAuditLogUseCase;
    submitSolicitud:           SubmitSolicitudUseCase;
    uploadFile:                UploadFileUseCase;
    deleteFile:                DeleteFileUseCase;
    listFiles:                 ListFilesUseCase;
  };
}

export function buildApp(): AppDependencies {
  // ── Infrastructure ───────────────────────────────────────────
  const hasher    = new PlainPasswordHasher(); // SWAP FOR BcryptPasswordHasher IN PRODUCTION
  const hmacKeys  = new HMACKeyProvider();
  const tokens    = new WebCryptoTokenService(hmacKeys);
  const sigCrypto = new WebCryptoSignatureService(hmacKeys);
  const events    = new InMemoryEventEmitter();
  const cooldown  = new InMemoryCooldownGate();

  const users       = new InMemoryUserRepository(hasher);
  const projects    = new InMemoryProjectRepository();
  const budgets     = new InMemoryBudgetRepository();
  const challenges  = new InMemoryChallengeRepository();
  const audit       = new InMemoryAuditRepository();
  const files       = new InMemoryFileRepository();
  const solicitudes = new InMemorySolicitudRepository();

  // ── Cross-cutting: audit subscriber ───────────────────────────
  const auditor = new AuditSubscriber(events, audit);
  auditor.start();

  // ── Use cases ──────────────────────────────────────────────────
  const useCases = {
    login:                      new LoginUseCase(users, tokens, events),
    createBudget:               new CreateBudgetUseCase(users, projects, budgets, events),
    sendBudget:                 new SendBudgetUseCase(users, budgets, events),
    deleteBudget:               new DeleteBudgetUseCase(users, budgets),
    listBudgets:                new ListBudgetsUseCase(users, budgets),
    requestSignatureChallenge:  new RequestSignatureChallengeUseCase(users, budgets, challenges, sigCrypto, events),
    signBudget:                 new SignBudgetUseCase(users, budgets, challenges, sigCrypto, events),
    createUser:                 new CreateUserUseCase(users, hasher, generateTempPassword, events),
    updateUser:                 new UpdateUserUseCase(users, hasher, events),
    deleteUser:                 new DeleteUserUseCase(users, events),
    listUsers:                  new ListUsersUseCase(users),
    createProject:              new CreateProjectUseCase(users, projects, events),
    updateProject:              new UpdateProjectUseCase(users, projects, events),
    deleteProject:              new DeleteProjectUseCase(users, projects),
    listProjects:               new ListProjectsUseCase(users, projects),
    queryAuditLog:              new QueryAuditLogUseCase(users, audit),
    submitSolicitud:            new SubmitSolicitudUseCase(solicitudes, cooldown),
    uploadFile:                 new UploadFileUseCase(users, projects, files, events),
    deleteFile:                 new DeleteFileUseCase(users, projects, files),
    listFiles:                  new ListFilesUseCase(users, projects, files),
  };

  return { users, projects, budgets, challenges, audit, events, tokens, signatureCrypto: sigCrypto, files, solicitudes, useCases };
}
