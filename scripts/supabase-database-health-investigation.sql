WITH activity AS (
  SELECT
    pid,
    query,
    query_start,
    xact_start,
    state,
    wait_event_type,
    backend_type,
    application_name,
    usename
  FROM pg_stat_activity
  WHERE query <> ''
    AND query <> '<insufficient privilege>'
),
classified AS (
  SELECT
    *,
    CASE
      WHEN query ~* '(pg_stat_activity|pg_locks|pg_stat_statements)' THEN 'database-monitoring'
      WHEN query ~* '^\s*(vacuum|analyze|reindex|cluster|refresh\s+materialized\s+view)\M' THEN 'maintenance'
      WHEN query ~* '^\s*(insert|update|delete|merge|copy|truncate)\M' THEN 'data-write'
      WHEN query ~* '^\s*(create|alter|drop|grant|revoke|comment)\M' THEN 'schema-or-permission-change'
      WHEN query ~* '^\s*(select|with|show|explain)\M' THEN 'data-read'
      WHEN query ~* '^\s*(begin|start\s+transaction|commit|rollback|savepoint|release)\M' THEN 'transaction-control'
      ELSE 'other'
    END AS statement_category,
    CASE
      WHEN backend_type IS DISTINCT FROM 'client backend' THEN 'database-internal'
      WHEN usename ~ '^supabase_' OR usename IN ('authenticator', 'supabase_admin') THEN 'supabase-service'
      WHEN application_name ~* '(supabase|postgrest|realtime|gotrue|storage|supavisor)' THEN 'supabase-service'
      ELSE 'application-or-admin'
    END AS source_category,
    CASE backend_type
      WHEN 'archiver' THEN 'archiver'
      WHEN 'autovacuum launcher' THEN 'autovacuum-launcher'
      WHEN 'autovacuum worker' THEN 'autovacuum-worker'
      WHEN 'background worker' THEN 'background-worker'
      WHEN 'background writer' THEN 'background-writer'
      WHEN 'checkpointer' THEN 'checkpointer'
      WHEN 'client backend' THEN 'client-backend'
      WHEN 'logical replication launcher' THEN 'logical-replication-launcher'
      WHEN 'logical replication worker' THEN 'logical-replication-worker'
      WHEN 'parallel worker' THEN 'parallel-worker'
      WHEN 'startup' THEN 'startup'
      WHEN 'walreceiver' THEN 'wal-receiver'
      WHEN 'walsender' THEN 'wal-sender'
      WHEN 'walwriter' THEN 'wal-writer'
      ELSE 'other'
    END AS backend_category,
    CASE
      WHEN state = 'active' THEN 'active'
      WHEN state = 'idle in transaction' THEN 'idle-in-transaction'
      WHEN state = 'idle in transaction (aborted)' THEN 'idle-in-transaction-aborted'
      WHEN state = 'fastpath function call' THEN 'fastpath-function'
      WHEN state = 'disabled' THEN 'disabled'
      ELSE 'other'
    END AS state_category,
    CASE
      WHEN wait_event_type IS NULL THEN 'none'
      WHEN wait_event_type IN ('Lock', 'Client', 'IO', 'Activity', 'Timeout', 'IPC') THEN lower(wait_event_type)
      ELSE 'other'
    END AS wait_category,
    CASE
      WHEN age(now(), query_start) < interval '10 minutes' THEN '5-10 minutes'
      WHEN age(now(), query_start) < interval '30 minutes' THEN '10-30 minutes'
      WHEN age(now(), query_start) < interval '1 hour' THEN '30-60 minutes'
      ELSE 'over 60 minutes'
    END AS age_bucket
  FROM activity
)
SELECT
  'long-running-query' AS signal_type,
  statement_category,
  source_category,
  backend_category,
  state_category,
  wait_category,
  age_bucket,
  cardinality(pg_blocking_pids(pid)) > 0 AS has_blockers,
  xact_start IS NOT NULL AS transaction_open,
  false AS relation_reference,
  false AS transaction_reference
FROM classified
WHERE state <> 'idle'
  AND age(now(), query_start) > interval '5 minutes'
UNION ALL
SELECT
  'exclusive-lock' AS signal_type,
  activity.statement_category,
  activity.source_category,
  activity.backend_category,
  activity.state_category,
  activity.wait_category,
  activity.age_bucket,
  cardinality(pg_blocking_pids(activity.pid)) > 0 AS has_blockers,
  activity.xact_start IS NOT NULL AS transaction_open,
  locks.relation IS NOT NULL AS relation_reference,
  locks.transactionid IS NOT NULL AS transaction_reference
FROM classified AS activity
JOIN pg_locks AS locks ON locks.pid = activity.pid
WHERE locks.mode = 'ExclusiveLock'
ORDER BY signal_type, age_bucket;
