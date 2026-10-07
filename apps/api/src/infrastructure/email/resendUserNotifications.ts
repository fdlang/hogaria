import { NOTIFICATION_COPY, type AppNotificationType } from "@reformapro/domain";
import type { UserNotificationEmail } from "../../application/notifications/user-notifications.js";
import type { UserRole } from "@reformapro/domain/entities";

const escapeHtml=(value:string)=>value.replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]!);
export class ResendUserNotifications implements UserNotificationEmail {
  constructor(private readonly apiKey:string|undefined,private readonly from:string|undefined,private readonly appUrl:string|undefined){}
  configured(){return Boolean(this.apiKey&&this.from&&this.appUrl);}
  async send(input:{notificationId:string;to:string;name:string;role:UserRole;type:AppNotificationType}){
    if(!this.configured())throw new Error("notification_email_not_configured");
    const copy=NOTIFICATION_COPY[input.type];
    const root=this.appUrl!.replace(/\/$/,"");
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json","Idempotency-Key":`app-notification/${input.notificationId}`},body:JSON.stringify({from:this.from,to:[input.to],subject:copy.title,html:`<div style="font-family:Arial,sans-serif;color:#302d29;max-width:560px;margin:auto"><img src="https://www.hogaria.design/brand/hogaria-wordmark.png" alt="Hogaria" width="190" style="display:block;margin-bottom:24px"/><p>Hola, ${escapeHtml(input.name)}:</p><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.summary)}</p><p><a href="${root}/#/${input.role}" style="display:inline-block;padding:12px 18px;background:#995637;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Abrir área privada</a></p><p style="color:#71685e;font-size:13px">Este aviso no contiene documentación sensible. Consulta siempre el área privada para ver la información vigente.</p></div>`})});
    if(!response.ok)throw new Error("notification_email_rejected");
    const body=await response.json().catch(()=>({})) as {id?:string};
    return body.id??input.notificationId;
  }
}
