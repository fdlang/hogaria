/**
 * Audit log use case.
 *
 * Admin-only, paginated, filterable. The AuditRepository is append-only;
 * the use-case is read-only. Writes happen via the IEventEmitter pipeline,
 * where an audit subscriber persists each domain event as an AuditEntry.
 */

import { IAuditRepository, IUserRepository } from "@reformapro/domain/repositories";
import { AuditEntry } from "@reformapro/domain/entities";
import { ForbiddenError } from "@reformapro/domain/errors";

export class QueryAuditLogUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly audit: IAuditRepository,
  ) {}

  async execute(cmd: {
    actorId: number;
    page?:   number | undefined;
    limit?:  number | undefined;
    action?: string | null;
    userId?: number | null;
    from?:   Date | null;
    to?:     Date | null;
  }): Promise<{ items: AuditEntry[]; total: number; page: number; limit: number; pages: number }> {
    const actor = await this.users.findById(cmd.actorId);
    if (!actor || actor.rol !== "admin") throw new ForbiddenError();

    return this.audit.findAll({
      page:   cmd.page   ?? 0,
      limit:  Math.min(cmd.limit ?? 50, 200), // cap at 200 to prevent abuse
      action: cmd.action ?? null,
      userId: cmd.userId ?? null,
      from:   cmd.from   ?? null,
      to:     cmd.to     ?? null,
    });
  }
}
