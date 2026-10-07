import { describe, expect, it, vi } from "vitest";
import { Email } from "@reformapro/domain/value-objects";
import { UserNotifications } from "./user-notifications.js";
import { MemoryUserNotificationStore } from "../../infrastructure/database/userNotificationStore.js";

const users = [
  { id: 1, email: Email.of("admin@hogaria.test"), nombre: "Admin", rol: "admin" as const, activo: true, createdAt: new Date() },
  { id: 2, email: Email.of("cliente@hogaria.test"), nombre: "Cliente", rol: "cliente" as const, activo: true, createdAt: new Date() },
  { id: 3, email: Email.of("pro@hogaria.test"), nombre: "Pro", rol: "profesional" as const, activo: true, createdAt: new Date() },
];
const userRepo = {
  findById: async (id:number)=>users.find(user=>user.id===id)??null,
  findByRole: async (role:string)=>users.filter(user=>user.rol===role),
} as never;
const projects = { findById: async()=>({id:7,clienteId:2,profesionalesAsignados:[{userId:3}]}) } as never;
const estimates = { findById: async()=>({id:9,clienteId:2,estado:"enviado"}) } as never;
const files = { findById: async()=>null } as never;

describe("durable user notifications",()=>{
  it("keeps each inbox private and excludes the actor",async()=>{
    const store=new MemoryUserNotificationStore();
    store.enqueueForTest({id:crypto.randomUUID(),kind:"project_updated",actorId:1,resourceType:"project",resourceId:"7",projectId:7,payload:{clientVisible:true,professionalIds:[3]},occurredAt:new Date().toISOString()});
    const service=new UserNotifications(userRepo,projects,estimates,files,store,{configured:()=>false,send:vi.fn()} as never);
    await service.processPending();
    expect((await service.list(2)).items).toHaveLength(1);
    expect((await service.list(3)).items).toHaveLength(1);
    expect((await service.list(1)).items).toHaveLength(0);
    const item=(await service.list(2)).items[0]!;
    await expect(service.markRead(3,item.id)).rejects.toMatchObject({name:"NotFoundError"});
    await service.markRead(2,item.id);
    expect(await service.unreadCount(2)).toBe(0);
  });

  it("keeps email failure independent from the in-app notice",async()=>{
    const store=new MemoryUserNotificationStore();
    store.enqueueForTest({id:crypto.randomUUID(),kind:"estimate_published",actorId:1,resourceType:"estimate",resourceId:"9",payload:{clientId:2},occurredAt:new Date().toISOString()});
    const email={configured:()=>true,send:vi.fn().mockRejectedValue(new Error("provider down"))};
    const service=new UserNotifications(userRepo,projects,estimates,files,store,email,()=>undefined);
    expect(await service.retry(1)).toMatchObject({events:1,emails:1,configured:true});
    expect((await service.list(2)).items[0]).toMatchObject({type:"estimate_published",title:"Nueva propuesta disponible"});
  });
});
