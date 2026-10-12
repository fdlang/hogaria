import type { NotificationType } from "./api/notifications.api";
type Role="admin"|"cliente"|"profesional";
export function notificationDestination(input:{role:Role;type:NotificationType;resourceId:string;projectId?:number}):string|null{
  if(input.type==="project_archived"||input.type==="project_unassigned"){
    if(input.role==="admin")return "#/admin/projects";
    return input.role==="cliente"?"#/cliente":"#/profesional";
  }
  const project=input.projectId??(input.type.startsWith("project_")&&/^\d+$/.test(input.resourceId)?Number(input.resourceId):undefined);
  if(input.role==="admin"){
    if(input.type==="request_submitted")return "#/admin/solicitudes";
    if(input.type.startsWith("estimate_"))return "#/admin/budgets";
    if(input.type.startsWith("work_"))return "#/admin/work";
    return project?`#/admin/projects/${project}`:"#/admin/projects";
  }
  if(input.role==="cliente"){
    if(input.type.startsWith("estimate_"))return "#/cliente/budgets";
    return project?`#/cliente/projects/${project}`:"#/cliente";
  }
  if(input.type.startsWith("work_"))return "#/profesional/work";
  return project?`#/profesional/projects/${project}`:"#/profesional";
}
