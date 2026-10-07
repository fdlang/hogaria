import{describe,expect,it}from"vitest";
import{notificationDestination}from"./notification-routing";
describe("notification destinations",()=>{
 it("uses only role-owned routes",()=>{
  expect(notificationDestination({role:"cliente",type:"estimate_published",resourceId:"8"})).toBe("#/cliente/budgets");
  expect(notificationDestination({role:"profesional",type:"project_assigned",resourceId:"7",projectId:7})).toBe("#/profesional/projects/7");
  expect(notificationDestination({role:"admin",type:"work_submitted",resourceId:"x"})).toBe("#/admin/work");
 });
});
