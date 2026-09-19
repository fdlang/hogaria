import { ValidationError } from "@reformapro/domain";
import type { WorkTrackingUseCases } from "../../application/use-cases/work-tracking.use-cases.js";
import type { HttpRequest, HttpResponse } from "./authController.js";
type Request = HttpRequest & {
  actorId?: number;
  params: Record<string, string>;
  query: Record<string, string>;
};
export function workController(work: WorkTrackingUseCases) {
  const body = (r: Request): Record<string, unknown> => {
    if (!r.body || typeof r.body !== "object" || Array.isArray(r.body))
      throw new ValidationError("Objeto JSON obligatorio");
    return r.body as Record<string, unknown>;
  };
  const wrap =
    (run: (r: Request) => Promise<unknown>) =>
    async (r: Request): Promise<HttpResponse> => ({
      status: 200,
      headers: { "Cache-Control": "no-store" },
      body: await run(r),
    });
  return {
    current: wrap((r) => work.current(r.actorId!)),
    audit: wrap((r) => work.auditLog(r.actorId!, Number(r.query.page ?? 0))),
    list: wrap((r) => {
      const input: Record<string, unknown> = { ...r.query };
      for (const key of ["projectId", "professionalId", "page"])
        if (key in input) input[key] = Number(input[key]);
      return work.list(r.actorId!, input);
    }),
    start: wrap((r) => work.start(r.actorId!, body(r))),
    part: wrap((r) => work.part(r.actorId!, body(r))),
    action: wrap((r) => work.action(r.actorId!, r.params.id!, body(r))),
    history: wrap((r) => work.history(r.actorId!, r.params.id!)),
    rates: wrap((r) => work.rates(r.actorId!, Number(r.params.id))),
    configure: wrap((r) =>
      work.configure(r.actorId!, Number(r.params.id), body(r)),
    ),
    summary: wrap((r) => work.summary(r.actorId!, Number(r.params.id))),
    budget: wrap((r) => work.budget(r.actorId!, Number(r.params.id), body(r))),
  };
}
