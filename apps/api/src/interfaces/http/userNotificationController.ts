import { ValidationError } from "@reformapro/domain/errors";
import type { UserNotifications } from "../../application/notifications/user-notifications.js";
import type { HttpResponse } from "./authController.js";
import { toHttpError } from "./errorMiddleware.js";

type Request={actorId:number;params:Record<string,string>;query:Record<string,string>};
const execute=async(operation:()=>Promise<HttpResponse>):Promise<HttpResponse>=>{try{return await operation();}catch(error){const mapped=toHttpError(error);return{status:mapped.status,body:mapped.body};}};
export function userNotificationController(service:UserNotifications){return{
  list:(req:Request)=>execute(async()=>{const limit=req.query.limit===undefined?20:Number(req.query.limit);if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw new ValidationError("Límite de notificaciones no válido");return{status:200,body:await service.list(req.actorId,req.query.cursor,limit)};}),
  unread:(req:Request)=>execute(async()=>({status:200,body:{count:await service.unreadCount(req.actorId)}})),
  read:(req:Request)=>execute(async()=>{if(!/^[0-9a-f-]{36}$/i.test(req.params.id??""))throw new ValidationError("Notificación no válida");await service.markRead(req.actorId,req.params.id!);return{status:204,body:null};}),
  readAll:(req:Request)=>execute(async()=>({status:200,body:{updated:await service.markAllRead(req.actorId)}})),
};}
