import { timingSafeEqual } from "node:crypto";
import type { HttpRequest, HttpResponse } from "./authController.js";
export function notificationRetryController(
 service:{retry():Promise<{processed:number;configured:boolean}>},
 config:()=>{secret:string|undefined;retrySecret?:string|undefined;enabled:boolean},
 maintenance?:{execute():Promise<{processed:number;deleted:number;failed:number}>},
){
 return async(req:HttpRequest):Promise<HttpResponse>=>{
  const {secret,retrySecret,enabled}=config();
  const supplied=new TextEncoder().encode(String(req.headers.authorization??""));
  const matches=(candidate:string|undefined)=>{
   if(!candidate?.trim())return false;
   const expected=new TextEncoder().encode(`Bearer ${candidate}`);
   return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
  };
  const cronAuthorized=matches(secret);
  const retryAuthorized=matches(retrySecret);
  if(!cronAuthorized&&!retryAuthorized)
   return {status:401,body:{message:"No autorizado"}};
  const headers={"Cache-Control":"no-store"};
  const notificationResult=enabled?await service.retry():{enabled:false};
  if(cronAuthorized)await maintenance?.execute();
  return {status:200,headers,body:notificationResult};
 };
}
