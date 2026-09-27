import {describe,it,expect,vi} from "vitest";
import {notificationRetryController} from "./notificationRetryController.js";
describe("notification retry endpoint",()=>{
 it("retries pending Blob deletions after authenticating the scheduler",async()=>{
  const service={retry:vi.fn(async()=>({processed:0,configured:true}))};
  const maintenance={execute:vi.fn(async()=>({processed:1,deleted:1,failed:0}))};
  const handler=notificationRetryController(service,()=>({secret:"test-secret",enabled:false}),maintenance);
  expect((await handler({headers:{authorization:"Bearer test-secret"}} as never)).status).toBe(200);
  expect(maintenance.execute).toHaveBeenCalledOnce();
  await handler({headers:{authorization:"Bearer wrong"}} as never);
  expect(maintenance.execute).toHaveBeenCalledOnce();
 });
 it("accepts independent scheduler secrets without replacing the existing cron secret",async()=>{
  const service={retry:vi.fn(async()=>({processed:1,configured:true}))};
  const handler=notificationRetryController(service,()=>({secret:"vercel-secret",retrySecret:"github-secret",enabled:true}));
  for(const secret of ["vercel-secret","github-secret"]){
   expect((await handler({headers:{authorization:`Bearer ${secret}`}} as never)).status).toBe(200);
  }
  for(const authorization of ["","Bearer github-secrex","github-secret","Bearer user-jwt"]){
   expect((await handler({headers:{authorization}} as never)).status).toBe(401);
  }
  expect(service.retry).toHaveBeenCalledTimes(2);
 });
 it("supports a retry secret alone and respects the off switch for it",async()=>{
  const service={retry:vi.fn(async()=>({processed:1,configured:true}))};
  const req={headers:{authorization:"Bearer github-secret"}} as never;
  const config={secret:undefined,retrySecret:"github-secret",enabled:true};
  expect((await notificationRetryController(service,()=>config)(req)).status).toBe(200);
  expect((await notificationRetryController(service,()=>({...config,enabled:false}))(req)).body).toEqual({enabled:false});
  expect(service.retry).toHaveBeenCalledTimes(1);
 });
 it("rejects empty or whitespace-only secrets",async()=>{
  const service={retry:vi.fn(async()=>({processed:0,configured:true}))};
  for(const secret of [undefined,"","   "]){
   const handler=notificationRetryController(service,()=>({secret,retrySecret:secret,enabled:true}));
   expect((await handler({headers:{authorization:`Bearer ${secret??""}`}} as never)).status).toBe(401);
  }
  expect(service.retry).not.toHaveBeenCalled();
 });
 it("requires the configured secret, not a user JWT or missing bearer",async()=>{
  const service={retry:vi.fn(async()=>({processed:1,configured:true}))};
  const handler=notificationRetryController(service,()=>({secret:"test-secret",enabled:true}));
  for(const authorization of ["","Bearer user-jwt","Bearer test-secrex"]){
   expect((await handler({headers:{authorization}} as never)).status).toBe(401);
  }
  expect(service.retry).not.toHaveBeenCalled();
  expect((await handler({headers:{authorization:"Bearer test-secret"}} as never)).status).toBe(200);
  expect(service.retry).toHaveBeenCalledTimes(1);
 });
 it("fails closed without a secret and respects the off switch",async()=>{
  const service={retry:vi.fn(async()=>({processed:1,configured:true}))};
  const req={headers:{authorization:"Bearer test-secret"}} as never;
  expect((await notificationRetryController(service,()=>({secret:undefined,enabled:true}))(req)).status).toBe(401);
  expect((await notificationRetryController(service,()=>({secret:"test-secret",enabled:false}))(req)).body).toEqual({enabled:false});
  expect(service.retry).not.toHaveBeenCalled();
 });
});
