import pg from "pg";
import { AuditEntry, CatalogItem, ChangeOrder, Estimate, EstimateDraft, EstimateVersion, Opportunity, OpportunityStatus, Project, User, UserRole } from "@reformapro/domain/entities";
import { Email, Money, Percentage } from "@reformapro/domain/value-objects";
import { IAuditRepository, ICatalogRepository, IChangeOrderRepository, IEstimateRepository, IOpportunityRepository, IProjectRepository, IUserRepository } from "@reformapro/domain/repositories";
import { NotFoundError, ConflictError } from "@reformapro/domain/errors";
import type { PasswordHasher } from "./inMemoryRepositories.js";
import type { ProjectFile, IFileRepository } from "../../application/use-cases/file.use-cases.js";
import type { ISolicitudRepository } from "../../application/use-cases/solicitud.use-cases.js";
import { calculateEstimateTotals } from "@reformapro/domain";

type Row = Record<string, any>;
const date = (value: string | Date) => new Date(value);
const projectPayload = (p: Project) => ({ ...p, progreso: p.progreso.value, presupuesto: p.presupuesto.amount, fechaInicio: p.fechaInicio.toISOString(), fechaFinPrevista: p.fechaFinPrevista.toISOString(), createdAt: p.createdAt.toISOString(), hitos: p.hitos.map(h => ({ ...h, fecha: h.fecha.toISOString() })) });
const restoreProject = (id: number, p: any): Project => ({ ...p, id, progreso: Percentage.of(p.progreso), presupuesto: Money.of(p.presupuesto), fechaInicio: date(p.fechaInicio), fechaFinPrevista: date(p.fechaFinPrevista), createdAt: date(p.createdAt), hitos: p.hitos.map((h: any) => ({ ...h, fecha: date(h.fecha) })) });

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly pool: pg.Pool | pg.PoolClient, private readonly hasher: PasswordHasher) {}
  private map(r: Row): User { return { id: Number(r.id), email: Email.of(r.email), nombre: r.nombre, rol: r.rol as UserRole, activo: r.activo, sessionVersion: Number(r.session_version ?? 0), createdAt: date(r.created_at), ...(r.profesion ? { profesion: r.profesion } : {}), ...(r.telefono ? { telefono: r.telefono } : {}) }; }
  async findById(id: number) { const r = await this.pool.query("SELECT * FROM users WHERE id=$1", [id]); return r.rows[0] ? this.map(r.rows[0]) : null; }
  async findByEmail(email: string) { const r = await this.pool.query("SELECT * FROM users WHERE lower(email)=lower($1)", [email]); return r.rows[0] ? this.map(r.rows[0]) : null; }
  async findAll() { return (await this.pool.query("SELECT * FROM users ORDER BY id")).rows.map(r => this.map(r)); }
  async findByRole(role: UserRole) { return (await this.pool.query("SELECT * FROM users WHERE rol=$1 ORDER BY id", [role])).rows.map(r => this.map(r)); }
  async save(user: User, passwordHash = "") { const r = await this.pool.query("INSERT INTO users(email,nombre,rol,profesion,telefono,activo,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [user.email.value,user.nombre,user.rol,user.profesion ?? null,user.telefono ?? null,user.activo,passwordHash,user.createdAt]); return this.map(r.rows[0]); }
  async update(id: number, changes: Partial<Omit<User,"id"|"createdAt">>, passwordHash?: string) {
    const ownsConnection = !("release" in this.pool);
    const client = ownsConnection ? await (this.pool as pg.Pool).connect() : this.pool as pg.PoolClient;
    try {
      if (ownsConnection) await client.query("BEGIN");
      // Serialize administrator changes, including concurrent deactivations.
      await client.query("SELECT pg_advisory_xact_lock(48127, 1)");
      const found = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rows[0]) throw new NotFoundError("Usuario");
      const current = this.map(found.rows[0]);
      const next = { ...current, ...changes };
      if (current.rol === "admin" && current.activo && (!next.activo || next.rol !== "admin")) {
        const other = await client.query("SELECT id FROM users WHERE rol='admin' AND activo=true AND id<>$1 LIMIT 1", [id]);
        if (!other.rows.length) throw new ConflictError("Debe quedar un administrador activo");
      }
      const revokeSessions = changes.activo === false || passwordHash !== undefined || changes.rol !== undefined;
      const result = await client.query("UPDATE users SET nombre=$2,rol=$3,profesion=$4,telefono=$5,activo=$6,password_hash=COALESCE($7,password_hash),session_version=session_version+$8 WHERE id=$1 RETURNING *", [id,next.nombre,next.rol,next.profesion ?? null,next.telefono ?? null,next.activo,passwordHash ?? null,revokeSessions ? 1 : 0]);
      if (changes.activo === false || passwordHash !== undefined || changes.rol !== undefined) await client.query("DELETE FROM account_activation_tokens WHERE user_id=$1", [id]);
      if (ownsConnection) await client.query("COMMIT");
      return this.map(result.rows[0]);
    } catch (error) {
      if (ownsConnection) await client.query("ROLLBACK");
      throw error;
    } finally { if (ownsConnection) client.release(); }
  }
  async delete(id: number) { await this.pool.query("DELETE FROM users WHERE id=$1", [id]); }
  async verifyPassword(email: string, plaintext: string) { const r = await this.pool.query("SELECT * FROM users WHERE lower(email)=lower($1)", [email]); if (!r.rows[0] || !(await this.hasher.verify(plaintext, r.rows[0].password_hash))) return null; return this.map(r.rows[0]); }
  async updatePassword(id: number, hash: string) { await this.update(id, {}, hash); }
}

export class PostgresProjectRepository implements IProjectRepository {
  constructor(private readonly pool: pg.Pool | pg.PoolClient) {} private map(r: Row) { return restoreProject(Number(r.id), r.payload); }
  async findById(id:number){const r=await this.pool.query("SELECT * FROM projects WHERE id=$1",[id]);return r.rows[0]?this.map(r.rows[0]):null} async findByClient(id:number){return(await this.pool.query("SELECT * FROM projects WHERE cliente_id=$1",[id])).rows.map(r=>this.map(r))} async findByProfesional(id:number){return(await this.pool.query("SELECT * FROM projects WHERE payload->'profesionalesAsignados' @> $1::jsonb",[JSON.stringify([{userId:id}])])).rows.map(r=>this.map(r))} async findAll(){return(await this.pool.query("SELECT * FROM projects ORDER BY id")).rows.map(r=>this.map(r))}
  async save(p:Project){const r=await this.pool.query("INSERT INTO projects(cliente_id,estimate_id,payload) VALUES($1,$2,$3) RETURNING *",[p.clienteId,p.estimateId,projectPayload(p)]);return this.map(r.rows[0])}
  async update(id:number,c:Partial<Omit<Project,"id"|"createdAt">>,expectedRevision?:number){
    const old=await this.findById(id);if(!old)throw new NotFoundError("Proyecto");
    const revision=expectedRevision ?? old.revision ?? 0;
    const next={...old,...c,revision:revision+1};
    const r=await this.pool.query("UPDATE projects SET cliente_id=$2,payload=$3 WHERE id=$1 AND COALESCE((payload->>'revision')::int,0)=$4 RETURNING *",[id,next.clienteId,projectPayload(next),revision]);
    if(!r.rows[0])throw new ConflictError("La obra ha cambiado. Actualiza los datos antes de guardar.");
    return this.map(r.rows[0]);
  }
}

export class PostgresOpportunityRepository implements IOpportunityRepository {
  async fromSolicitud(id: number, input: Omit<Opportunity, "id" | "createdAt" | "updatedAt">) {
    const result = await this.pool.query(`WITH source AS (SELECT id FROM solicitudes WHERE id=$1 AND estado<>'rechazado' FOR UPDATE),
      inserted AS (INSERT INTO opportunities(solicitud_id,cliente_id,nombre,email,telefono,direccion,tipo,descripcion,estado,notas_internas)
      SELECT id,NULL,$2,$3,$4,$5,$6,$7,'nueva','' FROM source
      ON CONFLICT(solicitud_id) WHERE solicitud_id IS NOT NULL DO UPDATE SET solicitud_id=EXCLUDED.solicitud_id RETURNING *),
      contacted AS (UPDATE solicitudes SET estado='contactado' WHERE id IN (SELECT solicitud_id FROM inserted))
      SELECT * FROM inserted`, [id,input.nombre,input.email,input.telefono,input.direccion,input.tipo,input.descripcion]);
    if (!result.rows[0]) throw new ConflictError("La solicitud no está disponible para convertir");
    return this.map(result.rows[0]);
  }
  constructor(private readonly pool: pg.Pool | pg.PoolClient) {}
  private map(r: Row): Opportunity { return { id: Number(r.id), clienteId: r.cliente_id == null ? null : Number(r.cliente_id), nombre: r.nombre, email: r.email, telefono: r.telefono, direccion: r.direccion, tipo: r.tipo, descripcion: r.descripcion, estado: r.estado as OpportunityStatus, fechaVisita: r.fecha_visita ? date(r.fecha_visita) : null, notasInternas: r.notas_internas, createdAt: date(r.created_at), updatedAt: date(r.updated_at) }; }
  async findById(id: number) { const r = await this.pool.query("SELECT * FROM opportunities WHERE id=$1", [id]); return r.rows[0] ? this.map(r.rows[0]) : null; }
  async findAll(status?: OpportunityStatus) { const r = await this.pool.query(status ? "SELECT * FROM opportunities WHERE estado=$1 ORDER BY updated_at DESC" : "SELECT * FROM opportunities ORDER BY updated_at DESC", status ? [status] : []); return r.rows.map(row => this.map(row)); }
  async save(o: Omit<Opportunity, "id" | "createdAt" | "updatedAt">) { const r = await this.pool.query("INSERT INTO opportunities(cliente_id,nombre,email,telefono,direccion,tipo,descripcion,estado,fecha_visita,notas_internas) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [o.clienteId,o.nombre,o.email,o.telefono,o.direccion,o.tipo,o.descripcion,o.estado,o.fechaVisita,o.notasInternas]); return this.map(r.rows[0]); }
  async update(id: number, changes: Partial<Omit<Opportunity, "id" | "createdAt" | "updatedAt">>) { const old = await this.findById(id); if (!old) throw new NotFoundError("Oportunidad"); const next = { ...old, ...changes }; const r = await this.pool.query("UPDATE opportunities SET cliente_id=$2,nombre=$3,email=$4,telefono=$5,direccion=$6,tipo=$7,descripcion=$8,estado=$9,fecha_visita=$10,notas_internas=$11,updated_at=NOW() WHERE id=$1 RETURNING *", [id,next.clienteId,next.nombre,next.email,next.telefono,next.direccion,next.tipo,next.descripcion,next.estado,next.fechaVisita,next.notasInternas]); return this.map(r.rows[0]); }
}

export class PostgresCatalogRepository implements ICatalogRepository {
  constructor(private readonly pool: pg.Pool) {}
  private map(row: Row): CatalogItem {
    return {
      id: Number(row.id), reference: row.reference, category: row.category,
      description: row.description, unit: row.unit, salePrice: Number(row.sale_price),
      vatRate: Number(row.vat_rate), active: row.active,
      createdAt: date(row.created_at), updatedAt: date(row.updated_at),
    };
  }
  async findAll(includeInactive = false) {
    const query = includeInactive
      ? "SELECT * FROM catalog_items ORDER BY category, reference"
      : "SELECT * FROM catalog_items WHERE active=true ORDER BY category, reference";
    return (await this.pool.query(query)).rows.map(row => this.map(row));
  }
  async findById(id: number) { const result = await this.pool.query("SELECT * FROM catalog_items WHERE id=$1", [id]); return result.rows[0] ? this.map(result.rows[0]) : null; }
  async findByReference(reference: string) { const result = await this.pool.query("SELECT * FROM catalog_items WHERE reference=$1", [reference]); return result.rows[0] ? this.map(result.rows[0]) : null; }
  async save(item: Omit<CatalogItem, "id" | "createdAt" | "updatedAt">) { const result = await this.pool.query("INSERT INTO catalog_items(reference,category,description,unit,sale_price,vat_rate,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [item.reference,item.category,item.description,item.unit,item.salePrice,item.vatRate,item.active]); return this.map(result.rows[0]); }
  async update(id: number, changes: Partial<Pick<CatalogItem, "reference" | "category" | "description" | "unit" | "salePrice" | "vatRate" | "active">>) { const current = await this.findById(id); if (!current) throw new NotFoundError("Partida de catálogo"); const next = { ...current, ...changes }; const result = await this.pool.query("UPDATE catalog_items SET reference=$2,category=$3,description=$4,unit=$5,sale_price=$6,vat_rate=$7,active=$8,updated_at=NOW() WHERE id=$1 RETURNING *", [id,next.reference,next.category,next.description,next.unit,next.salePrice,next.vatRate,next.active]); return this.map(result.rows[0]); }
}

export class PostgresEstimateRepository implements IEstimateRepository {
  async findPage(query: import("@reformapro/domain/repositories").EstimatePageQuery) {
    const words = query.search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = await this.pool.query(`WITH visible AS (
      SELECT e.id,e.oportunidad_id,e.cliente_id,e.numero,e.estado,e.version_actual,e.borrador,e.motivo_rechazo,e.created_at,e.updated_at,CASE WHEN $1::bigint IS NOT NULL AND e.estado='en_revision' THEN v.snapshot->>'titulo' ELSE e.titulo END titulo,COALESCE(v.snapshot->>'referencia','') reference,
      CASE WHEN e.estado='enviado' AND v.enviado_at+(v.snapshot->>'validezDias')::int*interval '1 day'<now() THEN 'caducado' ELSE e.estado END effective_state
      FROM estimates e LEFT JOIN LATERAL (SELECT * FROM budget_versions b WHERE b.estimate_id=e.id AND b.enviado_at IS NOT NULL AND (b.version=e.version_actual OR e.estado='en_revision') ORDER BY b.version DESC LIMIT 1) v ON true
      WHERE ($1::bigint IS NULL OR (e.cliente_id=$1 AND e.estado<>'borrador' AND (e.estado<>'en_revision' OR v.id IS NOT NULL)))
    ) SELECT * FROM visible WHERE ($3='' OR effective_state=$3)
      AND NOT EXISTS (SELECT 1 FROM unnest($2::text[]) word WHERE strpos(translate(lower(numero||' '||titulo||' '||reference||' '||CASE effective_state WHEN 'borrador' THEN 'Borrador' WHEN 'en_revision' THEN 'En revisión' WHEN 'enviado' THEN 'Enviado' WHEN 'firmado' THEN 'Firmado' WHEN 'aceptado' THEN 'Convertido en proyecto' WHEN 'rechazado' THEN 'Cambios solicitados' ELSE effective_state END),'áéíóúüñ','aeiouun'),word)=0)
      ORDER BY updated_at DESC,id DESC LIMIT $4 OFFSET $5`, [query.clientId ?? null,words,query.status,query.limit,query.page*query.limit]);
    return rows.rows.map(row => this.map(row));
  }
  constructor(private readonly pool: pg.Pool | pg.PoolClient) {}
  private map(r: Row): Estimate { return { id: Number(r.id), oportunidadId: Number(r.oportunidad_id), clienteId: Number(r.cliente_id), numero: r.numero, titulo: r.titulo, estado: r.estado, versionActual: Number(r.version_actual), borrador: r.borrador as EstimateDraft, motivoRechazo: r.motivo_rechazo ?? null, createdAt: date(r.created_at), updatedAt: date(r.updated_at) }; }
  private mapVersion(r: Row): EstimateVersion { return { id: Number(r.id), estimateId: Number(r.estimate_id), version: Number(r.version), snapshot: r.snapshot as EstimateDraft, enviadoAt: r.enviado_at ? date(r.enviado_at) : null, firmadoAt: r.firmado_at ? date(r.firmado_at) : null, firma: r.firma ?? null, createdAt: date(r.created_at) }; }
  async findById(id: number) { const r = await this.pool.query("SELECT * FROM estimates WHERE id=$1", [id]); return r.rows[0] ? this.map(r.rows[0]) : null; }
  async findAll() { return (await this.pool.query("SELECT * FROM estimates ORDER BY updated_at DESC")).rows.map(row => this.map(row)); }
  async save(e: Omit<Estimate, "id" | "createdAt" | "updatedAt">) { const r = await this.pool.query("INSERT INTO estimates(oportunidad_id,cliente_id,numero,titulo,estado,version_actual,borrador,motivo_rechazo) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [e.oportunidadId,e.clienteId,e.numero,e.titulo,e.estado,e.versionActual,e.borrador,e.motivoRechazo]); return this.map(r.rows[0]); }
  async update(id: number, changes: Partial<Pick<Estimate, "titulo" | "estado" | "versionActual" | "borrador" | "motivoRechazo">>) { const old = await this.findById(id); if (!old) throw new NotFoundError("Presupuesto"); const next = { ...old, ...changes }; const r = await this.pool.query("UPDATE estimates SET titulo=$2,estado=$3,version_actual=$4,borrador=$5,motivo_rechazo=$6,updated_at=NOW() WHERE id=$1 RETURNING *", [id,next.titulo,next.estado,next.versionActual,next.borrador,next.motivoRechazo]); return this.map(r.rows[0]); }
  async saveVersion(v: Omit<EstimateVersion, "id" | "createdAt">) { const r = await this.pool.query("INSERT INTO budget_versions(estimate_id,version,snapshot,enviado_at,firmado_at,firma) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [v.estimateId,v.version,v.snapshot,v.enviadoAt,v.firmadoAt,v.firma]); return this.mapVersion(r.rows[0]); }
  async findVersions(estimateId: number) { return (await this.pool.query("SELECT * FROM budget_versions WHERE estimate_id=$1 ORDER BY version DESC", [estimateId])).rows.map(row => this.mapVersion(row)); }
  async signVersion(estimateId: number, version: number, firma: Record<string, unknown>, firmadoAt: Date) { const r = await this.pool.query("UPDATE budget_versions SET firma=$3,firmado_at=$4 WHERE estimate_id=$1 AND version=$2 AND firmado_at IS NULL RETURNING *", [estimateId,version,firma,firmadoAt]); if (!r.rows[0]) throw new NotFoundError("Versión firmable"); return this.mapVersion(r.rows[0]); }
}

export class PostgresChangeOrderRepository implements IChangeOrderRepository {
  async transition(id: number, projectId: number, expected: ChangeOrder["estado"], next: ChangeOrder["estado"], actorId: number) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const project = await client.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [projectId]);
      if (!project.rows.length) throw new NotFoundError("Proyecto");
      const result = await client.query("UPDATE change_orders SET estado=$4,aprobado_at=CASE WHEN $4='aprobado' THEN now() ELSE NULL END,decision=jsonb_build_object('actorId',$5::bigint,'at',now(),'state',$4::text) WHERE id=$1 AND project_id=$2 AND estado=$3 RETURNING *", [id,projectId,expected,next,actorId]);
      if (!result.rows[0]) throw new ConflictError("La orden ha cambiado o ya fue resuelta. Actualiza los datos.");
      if (next === "aprobado") {
        const order = this.map(result.rows[0]);
        const delta = calculateEstimateTotals(order.payload.partidas).totalSinIva;
        await client.query("UPDATE projects SET payload=jsonb_set(jsonb_set(payload,'{presupuesto}',to_jsonb((payload->>'presupuesto')::numeric+$2::numeric)),'{revision}',to_jsonb(COALESCE((payload->>'revision')::int,0)+1)) WHERE id=$1",[projectId,delta]);
      }
      await client.query("COMMIT");
      return this.map(result.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  constructor(private readonly pool: pg.Pool) {}
  private map(r: Row): ChangeOrder { return { id: Number(r.id), projectId: Number(r.project_id), numero: r.numero, estado: r.estado, payload: r.payload as EstimateDraft, aprobadoAt: r.aprobado_at ? date(r.aprobado_at) : null, createdAt: date(r.created_at) }; }
  async findByProject(projectId: number) { return (await this.pool.query("SELECT * FROM change_orders WHERE project_id=$1 ORDER BY id DESC", [projectId])).rows.map(row => this.map(row)); }
  async save(c: Omit<ChangeOrder, "id" | "createdAt">) { const r = await this.pool.query("INSERT INTO change_orders(project_id,numero,estado,payload,aprobado_at) VALUES($1,$2,$3,$4,$5) RETURNING *", [c.projectId,c.numero,c.estado,c.payload,c.aprobadoAt]); return this.map(r.rows[0]); }
  async update(id: number, changes: Partial<Pick<ChangeOrder, "estado" | "payload" | "aprobadoAt">>) { const r = await this.pool.query("UPDATE change_orders SET estado=COALESCE($2,estado),payload=COALESCE($3,payload),aprobado_at=COALESCE($4,aprobado_at) WHERE id=$1 AND ($3::jsonb IS NULL OR estado='borrador') RETURNING *", [id,changes.estado ?? null,changes.payload ?? null,changes.aprobadoAt ?? null]); if (!r.rows[0]) throw new ConflictError("La orden no existe o ya fue publicada"); return this.map(r.rows[0]); }
}

export class PostgresAuditRepository implements IAuditRepository {
  constructor(private readonly pool: pg.Pool) {}
  async append(e: AuditEntry) {
    await this.pool.query("INSERT INTO audit_entries(id,payload,timestamp) VALUES($1,$2,$3)", [e.id, { ...e, timestamp: e.timestamp.toISOString() }, e.timestamp]);
  }
  async findAll(opts: { page?: number; limit?: number; action?: string | null; userId?: number | null; from?: Date | null; to?: Date | null }) {
    const page = Math.max(0, opts.page ?? 0);
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
    const clauses: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
    if (opts.action) add("payload->>'action'=?", opts.action);
    if (opts.userId != null) add("(payload->>'userId')::int=?", opts.userId);
    if (opts.from) add("timestamp>=?", opts.from);
    if (opts.to) add("timestamp<=?", opts.to);
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const totalResult = await this.pool.query(`SELECT count(*)::int AS total FROM audit_entries${where}`, values);
    const total = Number(totalResult.rows[0]?.total ?? 0);
    values.push(limit, page * limit);
    const rows = await this.pool.query(`SELECT payload FROM audit_entries${where} ORDER BY timestamp DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    const items = rows.rows.map(row => ({ ...row.payload, timestamp: date(row.payload.timestamp) } as AuditEntry));
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
export class PostgresSolicitudRepository implements ISolicitudRepository {
  constructor(private readonly pool: pg.Pool) {}
  private map(r: Row) { return { id: Number(r.id), nombre: r.nombre, email: r.email, telefono: r.telefono, tipo: r.tipo, descripcion: r.descripcion, estado: r.estado, ip: r.ip ?? "", fecha: date(r.fecha), motivo: r.motivo ?? null }; }
  async save(s: { nombre:string; email:string; telefono:string; tipo:string; descripcion:string; fecha:Date; estado:"pendiente"; ip:string }) { const r = await this.pool.query("INSERT INTO solicitudes(nombre,email,telefono,tipo,descripcion,estado,ip,fecha) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [s.nombre,s.email,s.telefono,s.tipo,s.descripcion,s.estado,s.ip,s.fecha]); return { id: Number(r.rows[0].id) }; }
  async findAll() { return (await this.pool.query("SELECT * FROM solicitudes ORDER BY fecha DESC")).rows.map(r => this.map(r)); }
  async findById(id: number) { const r = await this.pool.query("SELECT * FROM solicitudes WHERE id=$1", [id]); return r.rows[0] ? this.map(r.rows[0]) : null; }
  async update(id: number, changes: { estado: "contactado" | "rechazado"; motivo: string | null }) { const r = await this.pool.query("UPDATE solicitudes SET estado=$2,motivo=$3 WHERE id=$1 RETURNING *", [id, changes.estado, changes.motivo]); if (!r.rows[0]) throw new NotFoundError("Solicitud"); return this.map(r.rows[0]); }
}
export class PostgresFileRepository implements IFileRepository { constructor(private readonly pool: pg.Pool) {} async save(file: Omit<ProjectFile,"id">) { const r=await this.pool.query("INSERT INTO project_files(project_id,payload,uploaded_at) VALUES($1,$2,$3) RETURNING id",[file.projectId,{...file,uploadedAt:file.uploadedAt.toISOString()},file.uploadedAt]); return { ...file, id:Number(r.rows[0].id) }; } async findById(id:number) { const r=await this.pool.query("SELECT id,payload FROM project_files WHERE id=$1",[id]); return r.rows[0] ? { ...r.rows[0].payload, id:Number(r.rows[0].id), uploadedAt:date(r.rows[0].payload.uploadedAt) } as ProjectFile : null; } async findByProject(projectId:number) { const r=await this.pool.query("SELECT id,payload FROM project_files WHERE project_id=$1 ORDER BY id",[projectId]); return r.rows.map(row=>({ ...row.payload,id:Number(row.id),uploadedAt:date(row.payload.uploadedAt) } as ProjectFile)); } async delete(id:number) { await this.pool.query("DELETE FROM project_files WHERE id=$1",[id]); } }
