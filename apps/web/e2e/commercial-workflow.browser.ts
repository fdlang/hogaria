import { test, expect, type Page } from "@playwright/test";
async function authenticated(page: Page, role: string) {
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "test"));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({json:path === "/api/auth/me" ? {id:2,nombre:"Prueba",email:"test@example.es",rol:role,activo:true} : []});
  });
}
const line = {id:"line",categoria:"Obra",descripcion:"Ampliación de iluminación",cantidad:1,unidad:"global",precioVentaUnitario:100,descuento:0,iva:21};
const proposal = {titulo:"Propuesta",validezDias:30,condicionesPago:"A la entrega",garantia:"",notasCliente:"",partidas:[line],totalSinIva:100,totalIva:21,totalConIva:121,enviadoAt:"2026-09-01",expiresAt:"2026-10-01",firmadoAt:null,hash:null};
const estimate = {id:1,numero:"HOG-001",titulo:"Propuesta",estado:"enviado",versionActual:2,motivoRechazo:null,createdAt:"2026-09-01",updatedAt:"2026-09-01",propuesta:proposal};

test("request conversion opens an existing opportunity without creating a duplicate", async ({page}) => {
  await authenticated(page,"admin");
  await page.route("**/api/solicitudes", route => route.fulfill({json:[{id:3,nombre:"Solicitud prueba",email:"cliente@test.es",telefono:"614786341",tipo:"Baño",descripcion:"Reforma del baño completo",estado:"pendiente",fecha:"2026-09-01",ip:"127.0.0.1"}]}));
  let converted = false;
  await page.route("**/api/solicitudes/3/opportunity", route => { converted = true; expect(route.request().postDataJSON()).toEqual({direccion:"Calle Madrid 1"}); return route.fulfill({json:{id:9}}); });
  await page.route("**/api/opportunities", route => route.fulfill({json:[{id:9,clienteId:null,nombre:"Solicitud prueba",direccion:"Calle Madrid 1",tipo:"Baño",descripcion:"Reforma del baño completo"}]}));
  await page.goto("/admin/solicitudes");
  await page.getByRole("button",{name:"Ver",exact:true}).click();
  await page.getByLabel("Dirección de la obra").fill("Calle Madrid 1");
  await page.getByRole("button",{name:"Crear o abrir oportunidad"}).click();
  await expect(page.getByRole("textbox",{name:"Nombre de la oportunidad *",exact:true})).toHaveValue("Solicitud prueba");
  await expect(page.getByRole("textbox",{name:"Dirección *",exact:true})).toHaveValue("Calle Madrid 1");
  expect(converted).toBe(true);
});
test("client can inspect and download a published historical version", async ({page}) => {
  await authenticated(page,"cliente");
  await page.route("**/api/estimates?*",route => route.fulfill({json:[estimate]}));
  await page.route("**/api/estimates/1/history",route => route.fulfill({json:[{...estimate,versionActual:1,estado:"sustituido"}]}));
  await page.route("**/api/estimates/1/pdf?version=1",route => route.fulfill({contentType:"application/pdf",body:"%PDF-1.4\n%%EOF"}));
  await page.goto("/cliente/budgets");
  await page.getByRole("button",{name:/Ver propuesta/}).click();
  await page.getByRole("button",{name:"Ver histórico de versiones"}).click();
  await page.getByRole("button",{name:"Versión 1",exact:true}).click();
  const region = page.getByRole("region",{name:"Histórico de versiones"});
  const download = page.waitForEvent("download", event =>
    event.suggestedFilename().includes("v1.pdf"),
  );
  await region.getByRole("button",{name:"Descargar PDF"}).click();
  expect((await download).suggestedFilename()).toContain("v1.pdf");
});
test("client pagination searches beyond the current page", async ({page}) => {
  await authenticated(page,"cliente");
  await page.route("**/api/estimates?*",route => {
    const url = new URL(route.request().url());
    const searching = url.searchParams.get("search");
    const second = url.searchParams.get("page")==="1";
    return route.fulfill({json:searching ? [{...estimate,id:51,titulo:"Reforma lejana"}] : second ? [{...estimate,id:21,titulo:"Página segunda"}] : Array.from({length:20},(_,i)=>({...estimate,id:i+1,numero:`HOG-${i+1}`}))});
  });
  await page.goto("/cliente/budgets");
  await page.getByRole("button",{name:"Siguiente",exact:true}).click();
  await expect(page.getByText("Página segunda",{exact:true})).toBeVisible();
  await page.getByLabel("Buscar presupuestos").fill("Reforma lejana");
  await expect(page.getByText("Reforma lejana",{exact:true})).toBeVisible();
});
test("client explicitly approves a change and sees the updated project amount", async ({page}) => {
  await page.setViewportSize({width:390,height:850});
  await authenticated(page,"cliente");
  let approved = false;
  const project = {id:1,estimateId:1,nombre:"Obra",descripcion:"",clienteId:2,direccion:"Madrid",tipo:"Reforma",estado:"en_curso",progreso:10,presupuesto:100,fechaInicio:"2026-09-01",fechaFinPrevista:"2026-10-01",profesionalesAsignados:[{userId:9,profesion:"carpintero"}],hitos:[]};
  await page.route("**/api/projects/1",route => route.fulfill({json:{...project,presupuesto:approved?200:100}}));
  await page.route("**/api/projects/1/change-orders",route => route.fulfill({json:[{id:7,numero:"OC-7",estado:approved?"aprobado":"enviado",propuesta:proposal}]}));
  await page.route("**/api/projects/1/change-orders/7/transition",route => {expect(route.request().postDataJSON()).toEqual({estado:"aprobado",password:"Password12345"});approved=true;return route.fulfill({json:{id:7,estado:"aprobado"}});});
  await page.goto("/cliente/projects/1");
  await expect(page.getByRole("heading", { name: /Equipo/ })).toHaveCount(0);
  await page.getByRole("button",{name:"Revisar decisión"}).click();
  await expect(page.getByRole("button",{name:"Aceptar ampliación"})).toBeDisabled();
  await page.getByLabel("Confirma tu contraseña").fill("Password12345");
  await page.getByRole("button",{name:"Aceptar ampliación"}).click();
  await expect(page.getByText("OC-7 · aprobado",{exact:true})).toBeVisible();
  expect(approved).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
