import type { Pool } from "pg";
import type { NotificationIntent } from "@reformapro/domain";
import type { NotificationOutboxEvent, StoredUserNotification, UserNotificationStore } from "../../application/notifications/user-notifications.js";

const outbox = (row: Record<string, unknown>): NotificationOutboxEvent => ({
  id: String(row.id), kind: row.kind as NotificationOutboxEvent["kind"], actorId: Number(row.actor_id ?? 0),
  resourceType: row.resource_type as NotificationOutboxEvent["resourceType"], resourceId: String(row.resource_id),
  ...(row.project_id == null ? {} : { projectId: Number(row.project_id) }),
  payload: (row.payload ?? {}) as Record<string, unknown>, occurredAt: new Date(String(row.created_at)).toISOString(),
});
const notification = (row: Record<string, unknown>): StoredUserNotification => ({
  id: String(row.id), eventId: String(row.event_id), recipientId: Number(row.recipient_id),
  type: row.type as StoredUserNotification["type"], priority: row.priority as StoredUserNotification["priority"],
  resourceType: row.resource_type as StoredUserNotification["resourceType"], resourceId: String(row.resource_id),
  ...(row.project_id == null ? {} : { projectId: Number(row.project_id) }), email: true,
  occurredAt: new Date(String(row.created_at)).toISOString(), readAt: row.read_at == null ? null : new Date(String(row.read_at)).toISOString(),
  emailState: row.email_state as StoredUserNotification["emailState"],
});

export class PostgresUserNotificationStore implements UserNotificationStore {
  constructor(private readonly pool: Pool) {}
  async claimEvent() {
    const result = await this.pool.query(`WITH candidate AS (
      SELECT id FROM notification_event_outbox WHERE state IN ('pending','processing') AND next_attempt_at<=now() AND attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE notification_event_outbox n SET state='processing',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes'
      FROM candidate WHERE n.id=candidate.id RETURNING n.*`);
    return result.rows[0] ? outbox(result.rows[0]) : null;
  }
  async insertIntents(intents: NotificationIntent[]) {
    for (const item of intents) await this.pool.query(
      `INSERT INTO user_notifications(id,event_id,recipient_id,type,priority,resource_type,resource_id,project_id,created_at)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_id,recipient_id,type) DO NOTHING`,
      [item.eventId,item.recipientId,item.type,item.priority,item.resourceType,item.resourceId,item.projectId??null,item.occurredAt],
    );
  }
  async finishEvent(id: string, state: "processed"|"pending"|"failed", reason?: string) {
    await this.pool.query(`UPDATE notification_event_outbox SET state=CASE WHEN $2='pending' AND attempts>=8 THEN 'failed' ELSE $2 END,
      processed_at=CASE WHEN $2='processed' THEN now() ELSE processed_at END,
      next_attempt_at=CASE WHEN $2='pending' THEN now()+(LEAST(attempts,6)*interval '5 minutes') ELSE next_attempt_at END,
      failure_reason=$3 WHERE id=$1`, [id,state,reason??null]);
  }
  async list(recipientId: number, cursor: string|undefined, limit: number) {
    let cursorDate: string|undefined, cursorId: string|undefined;
    if (cursor) {
      try { [cursorDate,cursorId] = Buffer.from(cursor,"base64url").toString("utf8").split("|"); } catch { cursorDate=undefined; cursorId=undefined; }
    }
    const values: unknown[]=[recipientId,limit+1];
    const clause=cursorDate&&cursorId?"AND (created_at,id)<($3::timestamptz,$4::uuid)":"";
    if(clause){values.push(cursorDate,cursorId);}
    const rows=(await this.pool.query(`SELECT * FROM user_notifications WHERE recipient_id=$1 AND expires_at IS NULL ${clause} ORDER BY created_at DESC,id DESC LIMIT $2`,values)).rows;
    const hasMore=rows.length>limit; const page=rows.slice(0,limit); const last=page.at(-1);
    return {items:page.map(notification),nextCursor:hasMore&&last?Buffer.from(`${new Date(last.created_at).toISOString()}|${last.id}`).toString("base64url"):null};
  }
  async unreadCount(recipientId:number){return Number((await this.pool.query("SELECT count(*) FROM user_notifications WHERE recipient_id=$1 AND read_at IS NULL AND expires_at IS NULL",[recipientId])).rows[0].count);}
  async markRead(id:string,recipientId:number){return (await this.pool.query("UPDATE user_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_id=$2",[id,recipientId])).rowCount===1;}
  async markAllRead(recipientId:number){return (await this.pool.query("UPDATE user_notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL AND expires_at IS NULL",[recipientId])).rowCount??0;}
  async claimEmail(){
    await this.pool.query("UPDATE user_notifications SET email_state='failed',email_failure_reason=CASE WHEN email_first_attempt_at<now()-interval '23 hours' THEN 'idempotency_window_expired' ELSE 'attempts_exhausted' END WHERE email_state IN ('pending','sending') AND (email_attempts>=8 OR email_first_attempt_at<now()-interval '23 hours') AND email_next_attempt_at<=now()");
    const result=await this.pool.query(`WITH candidate AS (SELECT id FROM user_notifications WHERE email_state IN ('pending','sending') AND email_next_attempt_at<=now() AND email_attempts<8 AND (email_first_attempt_at IS NULL OR email_first_attempt_at>=now()-interval '23 hours') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE user_notifications n SET email_state='sending',email_attempts=email_attempts+1,email_first_attempt_at=COALESCE(email_first_attempt_at,now()),email_next_attempt_at=now()+interval '2 minutes' FROM candidate WHERE n.id=candidate.id RETURNING n.*`);
    return result.rows[0]?notification(result.rows[0]):null;
  }
  async finishEmail(id:string,state:"accepted"|"skipped"|"pending",providerId?:string,reason?:string){await this.pool.query(`UPDATE user_notifications SET email_state=CASE WHEN $2='pending' AND email_attempts>=8 THEN 'failed' ELSE $2 END,email_provider_id=COALESCE($3,email_provider_id),email_failure_reason=$4,email_next_attempt_at=CASE WHEN $2='pending' THEN now()+(LEAST(email_attempts,6)*interval '5 minutes') ELSE email_next_attempt_at END WHERE id=$1`,[id,state,providerId??null,reason??null]);}
}

export class MemoryUserNotificationStore implements UserNotificationStore {
  private readonly events: NotificationOutboxEvent[]=[]; private readonly items: StoredUserNotification[]=[];
  async claimEvent(){return this.events.shift()??null;}
  async insertIntents(intents:NotificationIntent[]){for(const intent of intents)if(!this.items.some(item=>item.eventId===intent.eventId&&item.recipientId===intent.recipientId&&item.type===intent.type))this.items.push({...intent,id:crypto.randomUUID(),readAt:null,emailState:"pending"});}
  async finishEvent(){return;}
  async list(recipientId:number,_cursor:string|undefined,limit:number){return{items:this.items.filter(item=>item.recipientId===recipientId).slice(0,limit),nextCursor:null};}
  async unreadCount(recipientId:number){return this.items.filter(item=>item.recipientId===recipientId&&!item.readAt).length;}
  async markRead(id:string,recipientId:number){const item=this.items.find(value=>value.id===id&&value.recipientId===recipientId);if(!item)return false;item.readAt??=new Date().toISOString();return true;}
  async markAllRead(recipientId:number){let count=0;for(const item of this.items)if(item.recipientId===recipientId&&!item.readAt){item.readAt=new Date().toISOString();count++;}return count;}
  async claimEmail(){return this.items.find(item=>item.emailState==="pending")??null;}
  async finishEmail(id:string,state:"accepted"|"skipped"|"pending",providerId?:string){const item=this.items.find(value=>value.id===id);if(item){item.emailState=state;void providerId;}}
  enqueueForTest(event:NotificationOutboxEvent){this.events.push(event);}
}
