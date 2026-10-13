import{useCallback,useEffect,useRef,useState}from"react";
import type{UserNotificationsApi,AppNotificationDTO}from"../api/notifications.api";
import{notificationDestination}from"../notification-routing";

export function NotificationBell({api,role,navigate}:{api:UserNotificationsApi;role:"admin"|"cliente"|"profesional";navigate:(to:string)=>void}){
 const[open,setOpen]=useState(false),[count,setCount]=useState(0),[items,setItems]=useState<AppNotificationDTO[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[mutating,setMutating]=useState(false),[error,setError]=useState("");
 const root=useRef<HTMLDivElement>(null);
 const countRequest=useRef(0),listRequest=useRef(0),loadingRef=useRef(false);
 const refreshCount=useCallback(async(signal?:AbortSignal)=>{const request=++countRequest.current;try{const next=await api.unread(signal);if(request===countRequest.current)setCount(next);}catch(error){if(request===countRequest.current&&(error as Error).name!=="AbortError")setError("No se pudieron actualizar los avisos.");}},[api]);
 const load=useCallback(async(append=false)=>{if(loadingRef.current)return;loadingRef.current=true;const request=++listRequest.current;setLoading(true);setError("");try{const page=await api.list(append?cursor??undefined:undefined);if(request!==listRequest.current)return;setItems(current=>append?[...current,...page.items]:page.items);setCursor(page.nextCursor);}catch{if(request===listRequest.current)setError("No se pudieron cargar los avisos.");}finally{if(request===listRequest.current){loadingRef.current=false;setLoading(false);}}},[api,cursor]);
 useEffect(()=>{const controller=new AbortController();void refreshCount(controller.signal);const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refreshCount();},60_000);const focus=()=>void refreshCount();window.addEventListener("focus",focus);return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener("focus",focus);};},[refreshCount]);
 useEffect(()=>{if(open)void load();else{listRequest.current++;loadingRef.current=false;setLoading(false);}},[open]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const keyboard=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};document.addEventListener("pointerdown",close);window.addEventListener("keydown",keyboard);return()=>{document.removeEventListener("pointerdown",close);window.removeEventListener("keydown",keyboard);};},[open]);
 const select=async(item:AppNotificationDTO)=>{if(mutating)return;setMutating(true);setError("");try{if(!item.readAt){await api.markRead(item.id);setCount(value=>Math.max(0,value-1));}}catch{setError("No se pudo marcar el aviso como leído; seguirá pendiente.");}finally{setMutating(false);setOpen(false);const destination=notificationDestination({role,type:item.type,resourceId:item.resourceId,...(item.projectId===undefined?{}:{projectId:item.projectId})});if(destination)navigate(destination);}};
 const markAll=async()=>{if(mutating)return;setMutating(true);setError("");try{await api.markAllRead();setItems(current=>current.map(item=>({...item,readAt:item.readAt??new Date().toISOString()})));setCount(0);}catch{setError("No se pudieron marcar los avisos como leídos.");}finally{setMutating(false);}};
 return <div className="notification-center" ref={root}>
  <button className="notification-center__bell" type="button" aria-label={count?`Notificaciones: ${count} sin leer`:"Notificaciones"} aria-expanded={open} aria-controls="notification-panel" onClick={()=>setOpen(value=>!value)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{count>0&&<b>{count>99?"99+":count}</b>}</button>
  {open&&<section id="notification-panel" className="notification-center__panel" aria-label="Notificaciones">
   <header><div><p className="eyebrow">Actividad</p><h2>Notificaciones</h2></div>{count>0&&<button type="button" disabled={mutating} onClick={()=>void markAll()}>Marcar leídas</button>}</header>
   {error&&<p className="notification-center__error" role="status">{error}</p>}
   {!loading&&!items.length&&!error&&<p className="notification-center__empty">No tienes avisos pendientes.</p>}
   <div className="notification-center__list">{items.map(item=><button key={item.id} type="button" className={item.readAt?"is-read":"is-unread"} onClick={()=>void select(item)}><span className="notification-center__dot" aria-hidden="true"/><strong>{item.title}</strong><span>{item.summary}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("es-ES",{dateStyle:"short",timeStyle:"short"}).format(new Date(item.createdAt))}</time></button>)}</div>
   {cursor&&<button className="notification-center__more" type="button" disabled={loading} onClick={()=>void load(true)}>{loading?"Cargando…":"Ver anteriores"}</button>}
  </section>}
 </div>;
}
