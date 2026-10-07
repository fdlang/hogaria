import { ApiClient } from "@/shared/lib/api-client";
import { ApiContractError, isRecord } from "@/shared/lib/contracts";

export type NotificationType="request_submitted"|"estimate_published"|"estimate_signed"|"estimate_rejected"|"project_created"|"project_updated"|"project_assigned"|"project_unassigned"|"document_uploaded"|"change_order_sent"|"change_order_decided"|"work_submitted"|"work_reviewed"|"work_rate_changed";
export interface AppNotificationDTO {id:string;type:NotificationType;title:string;summary:string;priority:"normal"|"high";resourceType:string;resourceId:string;projectId?:number;createdAt:string;readAt:string|null;}
export interface NotificationPage {items:AppNotificationDTO[];nextCursor:string|null;}
const types=new Set<NotificationType>(["request_submitted","estimate_published","estimate_signed","estimate_rejected","project_created","project_updated","project_assigned","project_unassigned","document_uploaded","change_order_sent","change_order_decided","work_submitted","work_reviewed","work_rate_changed"]);
const pageContract=(value:unknown):NotificationPage=>{
  if(!isRecord(value)||!Array.isArray(value.items)||(value.nextCursor!==null&&typeof value.nextCursor!=="string"))throw new ApiContractError("las notificaciones");
  const items=value.items.map(item=>{
    if(!isRecord(item)||typeof item.id!=="string"||!types.has(item.type as NotificationType)||typeof item.title!=="string"||typeof item.summary!=="string"||!(["normal","high"] as unknown[]).includes(item.priority)||typeof item.resourceType!=="string"||typeof item.resourceId!=="string"||typeof item.createdAt!=="string"||(item.readAt!==null&&typeof item.readAt!=="string")||(item.projectId!==undefined&&!Number.isSafeInteger(item.projectId)))throw new ApiContractError("las notificaciones");
    return item as unknown as AppNotificationDTO;
  });
  return{items,nextCursor:value.nextCursor};
};
export class UserNotificationsApi{
  constructor(private readonly http:ApiClient){}
  async list(cursor?:string){const query=new URLSearchParams({limit:"20"});if(cursor)query.set("cursor",cursor);return pageContract(await this.http.get<unknown>(`/notifications?${query}`));}
  async unread(signal?:AbortSignal){const value=await this.http.get<unknown>("/notifications/unread-count",signal);if(!isRecord(value)||!Number.isSafeInteger(value.count)||Number(value.count)<0)throw new ApiContractError("el contador de notificaciones");return Number(value.count);}
  markRead(id:string){return this.http.post<void>(`/notifications/${encodeURIComponent(id)}/read`,{});}
  markAllRead(){return this.http.post<{updated:number}>("/notifications/read-all",{});}
}
