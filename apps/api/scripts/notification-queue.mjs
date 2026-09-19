// Administrative CLI: DATABASE_URL must belong to an authorized operator.
// Never run this command with a browser-exposed database credential.
import pg from "pg";
const [command = "list", id, confirmation] = process.argv.slice(2);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada");
if (!["list", "retry"].includes(command))
  throw new Error("Usa list o retry <uuid> --confirmed-not-delivered");
if (
  command === "retry" &&
  (!/^[0-9a-f-]{36}$/i.test(id ?? "") ||
    confirmation !== "--confirmed-not-delivered")
)
  throw new Error(
    "Comprueba primero la entrega en Resend y confirma con --confirmed-not-delivered",
  );
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (command === "list") {
    console.table(
      (
        await pool.query(
          "SELECT state,count(*),min(created_at) AS oldest FROM client_email_notifications GROUP BY state",
        )
      ).rows,
    );
    console.table(
      (
        await pool.query(
          "SELECT id,state,attempts,provider_id,failure_reason,first_attempt_at,created_at FROM client_email_notifications WHERE state IN ('failed','pending','sending') ORDER BY created_at LIMIT 100",
        )
      ).rows,
    );
  } else {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE client_email_notifications SET state='pending',attempts=0,first_attempt_at=NULL,failure_reason=NULL,next_attempt_at=now(),updated_at=now() WHERE id=$1 AND state='failed' RETURNING id",
        [id],
      );
      if (result.rowCount !== 1)
        throw new Error("Solo se pueden reactivar avisos fallidos");
      const auditId = crypto.randomUUID();
      await client.query(
        "INSERT INTO audit_entries(id,payload,timestamp) VALUES($1,$2,now())",
        [
          auditId,
          JSON.stringify({
            action: "NOTIFICATION_MANUAL_RETRY",
            id: auditId,
            userId: 0,
            userName: "Operador de base de datos",
            timestamp: new Date().toISOString(),
            ip: "not-applicable",
            userAgent: "notification-queue-cli",
            details: { notificationId: id, confirmation: "provider_checked_not_delivered" },
          }),
        ],
      );
      await client.query("COMMIT");
      console.log(
        "Aviso reactivado. Lo recogerá el siguiente procesamiento de cola.",
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
