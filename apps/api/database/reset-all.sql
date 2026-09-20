-- Full Hogaria reset. Every application table and its rows are removed.
-- Platform-managed objects outside this explicit list are never touched.
BEGIN;
DROP TABLE IF EXISTS
  professional_documents,
  client_email_notifications,
  rate_limit_windows,
  work_events,
  work_entries,
  work_rates,
  work_budgets,
  work_sessions,
  project_files,
  signature_challenges,
  change_orders,
  projects,
  budget_versions,
  budgets,
  estimates,
  opportunities,
  catalog_items,
  account_activation_tokens,
  solicitudes,
  audit_entries,
  users
CASCADE;
COMMIT;
