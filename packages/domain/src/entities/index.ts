import { Email, Money, Percentage } from "../value-objects/index.js";

export type UserRole = "admin" | "cliente" | "profesional";
export type Profesion = "albanil" | "electricista" | "fontanero" | "pintor" | "carpintero" | "reformista";
export interface User { id: number; email: Email; nombre: string; rol: UserRole; profesion?: Profesion; telefono?: string; activo: boolean; createdAt: Date; }

export type ProjectStatus = "planificacion" | "en_curso" | "pausado" | "finalizado";
export interface ProjectProfessional { userId: number; profesion?: Profesion; }
export interface ProjectMilestone { id: string; nombre: string; completado: boolean; fecha: Date; }
export interface Project { id: number; revision?: number; estimateId: number; nombre: string; descripcion: string; clienteId: number; direccion: string; tipo: string; estado: ProjectStatus; progreso: Percentage; presupuesto: Money; fechaInicio: Date; fechaFinPrevista: Date; profesionalesAsignados: ProjectProfessional[]; hitos: ProjectMilestone[]; createdAt: Date; }

export type OpportunityStatus = "nueva" | "contactada" | "visita_agendada" | "en_estudio" | "ganada" | "descartada";
export interface Opportunity { id: number; clienteId: number | null; nombre: string; email: string | null; telefono: string | null; direccion: string; tipo: string; descripcion: string; estado: OpportunityStatus; fechaVisita: Date | null; notasInternas: string; createdAt: Date; updatedAt: Date; }

export type EstimateStatus = "borrador" | "en_revision" | "enviado" | "firmado" | "aceptado" | "rechazado" | "caducado" | "sustituido";
export type ChangeOrderStatus = "borrador" | "enviado" | "aprobado" | "rechazado";
export interface EstimateLine { id: string; categoria: string; descripcion: string; cantidad: number; unidad: string; precioVentaUnitario: number; costeUnitario: number | null; descuento: number; iva: number; notaCliente?: string; notaInterna?: string; }
export interface EstimateDraft { titulo: string; referencia?: string; validezDias: number; condicionesPago: string; garantia: string; notasCliente: string; notasInternas: string; partidas: EstimateLine[]; }
export interface Estimate { id: number; oportunidadId: number; clienteId: number; numero: string; titulo: string; estado: EstimateStatus; versionActual: number; borrador: EstimateDraft; motivoRechazo: string | null; createdAt: Date; updatedAt: Date; }
export interface EstimateVersion { id: number; estimateId: number; version: number; snapshot: EstimateDraft; enviadoAt: Date | null; firmadoAt: Date | null; firma: Record<string, unknown> | null; createdAt: Date; }
export interface ChangeOrder { id: number; projectId: number; numero: string; estado: ChangeOrderStatus; payload: EstimateDraft; aprobadoAt: Date | null; createdAt: Date; }
export interface CatalogItem { id: number; reference: string; category: string; description: string; unit: string; salePrice: number; vatRate: number; active: boolean; createdAt: Date; updatedAt: Date; }
export interface AuditEntry { id: string; action: string; userId: number; userName: string; details: Record<string, unknown>; timestamp: Date; ip: string; userAgent: string; }
