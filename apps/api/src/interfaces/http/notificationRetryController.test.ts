import {describe,it,expect,vi} from "vitest";
import {notificationRetryController} from "./notificationRetryController.js";
describe("notification retry endpoint",()=>{
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
