import { timingSafeEqual } from "node:crypto";
import type { HttpRequest, HttpResponse } from "./authController.js";
export function notificationRetryController(
 service:{retry():Promise<{processed:number;configured:boolean}>},
 config:()=>{secret:string|undefined;enabled:boolean},
){
 return async(req:HttpRequest):Promise<HttpResponse>=>{
  const {secret,enabled}=config();
  const supplied=new TextEncoder().encode(String(req.headers.authorization??""));
  const expected=new TextEncoder().encode(`Bearer ${secret??""}`);
  if(!secret||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))
   return {status:401,body:{message:"No autorizado"}};
  const headers={"Cache-Control":"no-store"};
  if(!enabled)return {status:200,headers,body:{enabled:false}};
  return {status:200,headers,body:await service.retry()};
 };
}
