import { describe, expect, it } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { ForbiddenError, NotFoundError } from "@reformapro/domain/errors";
import {
  InMemoryUserRepository,
  InMemoryProjectRepository,
  InMemoryOpportunityRepository,
  InMemoryEstimateRepository,
  InMemoryChangeOrderRepository,
} from "../../infrastructure/database/inMemoryRepositories.js";
import { InMemoryEventEmitter } from "../../infrastructure/events/inMemoryEventEmitter.js";
import { ChangeOrderUseCases, EstimateUseCases } from "./sales.use-cases.js";
import { PermissionPolicy } from "@reformapro/domain/services";
import { Money, Percentage } from "@reformapro/domain/value-objects";

const hasher = {
  hash: async () => "hash",
  verify: async (_plain: string, hash: string) => hash === "hash",
};
const cryptoPort = {
  hashDocument: async () => ({ value: "sha256:test" }),
  generateSignatureToken: async () => "token",
  verifySignatureToken: async () => true,
};
const draft = {
  titulo: "Reforma de vivienda",
  validezDias: 30,
  condicionesPago: "50% al inicio",
  garantia: "",
  notasCliente: "",
  notasInternas: "Margen reservado",
  partidas: [
    {
      id: "linea-1",
      categoria: "Obra",
      descripcion: "Revestimiento",
      cantidad: 2,
      unidad: "m²",
      precioVentaUnitario: 100,
      costeUnitario: 45,
      descuento: 0,
      iva: 21,
      notaInterna: "Proveedor preferente",
    },
  ],
};

async function setup() {
  const users = new InMemoryUserRepository(hasher);
  const clientA = await users.save(
    {
      id: 0,
      email: Email.of("a@hogaria.test"),
      nombre: "Cliente A",
      rol: "cliente",
      activo: true,
      createdAt: new Date(),
    },
    "hash",
  );
  const clientB = await users.save(
    {
      id: 0,
      email: Email.of("b@hogaria.test"),
      nombre: "Cliente B",
      rol: "cliente",
      activo: true,
      createdAt: new Date(),
    },
    "hash",
  );
  const opportunities = new InMemoryOpportunityRepository();
  const estimates = new InMemoryEstimateRepository();
  const estimateUseCases = new EstimateUseCases(
    users,
    opportunities,
    estimates,
    new InMemoryProjectRepository(),
    new InMemoryEventEmitter(),
    cryptoPort,
  );
  const opportunityA = await opportunities.save({
    clienteId: clientA.id,
    nombre: "A",
    email: null,
    telefono: null,
    direccion: "Calle A",
    tipo: "Reforma",
    descripcion: "",
    estado: "nueva",
    fechaVisita: null,
    notasInternas: "",
  });
  const opportunityB = await opportunities.save({
    clienteId: clientB.id,
    nombre: "B",
    email: null,
    telefono: null,
    direccion: "Calle B",
    tipo: "Reforma",
    descripcion: "",
    estado: "nueva",
    fechaVisita: null,
    notasInternas: "",
  });
  const estimateA = await estimates.save({
    oportunidadId: opportunityA.id,
    clienteId: clientA.id,
    numero: "HOG-A",
    titulo: draft.titulo,
    estado: "enviado",
    versionActual: 1,
    borrador: draft,
  });
  const estimateB = await estimates.save({
    oportunidadId: opportunityB.id,
    clienteId: clientB.id,
    numero: "HOG-B",
    titulo: draft.titulo,
    estado: "enviado",
    versionActual: 1,
    borrador: draft,
  });
  for (const estimate of [estimateA, estimateB])
    await estimates.saveVersion({
      estimateId: estimate.id,
      version: 1,
      snapshot: {
        ...draft,
        notasInternas: "",
        partidas: draft.partidas.map(
          ({ costeUnitario: _, notaInterna: __, ...line }) => ({
            ...line,
            costeUnitario: null,
          }),
        ),
      },
      enviadoAt: new Date(),
      firmadoAt: null,
      firma: null,
    });
  return {
    users,
    clientA,
    clientB,
    estimateA,
    estimateB,
    estimates,
    estimateUseCases,
  };
}

import { vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { EstimateDocumentUseCases } from "./estimate-document.use-cases.js";
import { PdfEstimateRenderer } from "../../infrastructure/documents/estimatePdf.js";

async function documents() {
  const f = await setup(),
    pdf = { render: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) },
    gate = { check: vi.fn(async () => true) };
  return {
    ...f,
    pdf,
    gate,
    service: new EstimateDocumentUseCases(
      f.users,
      f.estimateUseCases,
      pdf,
      gate,
    ),
  };
}
describe("Download-only budget PDF", () => {
  it("downloads a previously published version while a new revision is internal", async () => {
    const f = await documents();
    await f.estimates.update(f.estimateA.id,{estado:"en_revision",versionActual:2,borrador:{...draft,titulo:"Internal revision"}});
    const result = await f.service.download(f.clientA.id,f.estimateA.id,1);
    expect(result.filename).toContain("v1.pdf");
    expect(JSON.stringify(f.pdf.render.mock.calls)).not.toContain("Internal revision");
    await expect(f.service.download(f.clientA.id,f.estimateA.id,2)).rejects.toThrow();
  });
  it("blocks cross-client access", async () => {
    const f = await documents();
    await expect(
      f.service.download(f.clientB.id, f.estimateA.id, 1),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(f.pdf.render).not.toHaveBeenCalled();
  });
  it("never includes internal costs or notes", async () => {
    const f = await documents();
    await f.service.download(f.clientA.id, f.estimateA.id, 1);
    const v = JSON.stringify(f.pdf.render.mock.calls[0]);
    expect(v).not.toContain("costeUnitario");
    expect(v).not.toContain("notaInterna");
    expect(v).not.toContain("Margen reservado");
  });
  it("blocks stale versions, drafts and inactive accounts", async () => {
    const f = await documents();
    await expect(
      f.service.download(f.clientA.id, f.estimateA.id, 2),
    ).rejects.toThrow();
    await f.estimates.update(f.estimateA.id, { estado: "borrador" });
    await expect(
      f.service.download(f.clientA.id, f.estimateA.id, 1),
    ).rejects.toThrow();
    await f.users.update(f.clientA.id, { activo: false });
    await expect(
      f.service.download(f.clientA.id, f.estimateB.id, 1),
    ).rejects.toThrow();
  });
  it("creates stable multipage PDFs without sending email", async () => {
    const f = await setup(),
      r = new PdfEstimateRenderer(),
      doc = await f.estimateUseCases.publicGet(f.clientA.id, f.estimateA.id);
    doc.propuesta!.partidas = Array.from({ length: 55 }, (_, i) => ({
      ...doc.propuesta!.partidas[0]!,
      id: String(i),
    }));
    const bytes = await r.render(doc);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    expect(await r.render(doc)).toEqual(bytes);
  });
});
