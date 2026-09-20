import { timingSafeEqual } from "node:crypto";
import type { HttpRequest, HttpResponse } from "./authController.js";
export function notificationRetryController(
 service:{retry():Promise<{processed:number;configured:boolean}>},
 config:()=>{secret:string|undefined;retrySecret?:string|undefined;enabled:boolean},
){
 return async(req:HttpRequest):Promise<HttpResponse>=>{
  const {secret,retrySecret,enabled}=config();
  const supplied=new TextEncoder().encode(String(req.headers.authorization??""));
  let authorized=false;
  for(const candidate of [secret,retrySecret]){
   if(!candidate?.trim())continue;
   const expected=new TextEncoder().encode(`Bearer ${candidate}`);
   if(supplied.length===expected.length&&timingSafeEqual(supplied,expected))authorized=true;
  }
  if(!authorized)
   return {status:401,body:{message:"No autorizado"}};
  const headers={"Cache-Control":"no-store"};
  if(!enabled)return {status:200,headers,body:{enabled:false}};
  return {status:200,headers,body:await service.retry()};
 };
}
