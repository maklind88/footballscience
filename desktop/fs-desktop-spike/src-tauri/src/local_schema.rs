use crate::authority::{
    SYNTHETIC_ORGANIZATION_ID, SYNTHETIC_PARTITION_KEY, SYNTHETIC_TEAM_ID, SYNTHETIC_TENANT_ID,
};
use crate::local_data::SYNTHETIC_SESSION_ID;
use rusqlite::{Connection, params};
use std::fs;
use std::path::Path;

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA trusted_schema = OFF;",
        )
        .map_err(|error| error.to_string())?;
    migrate(&connection)?;
    seed_synthetic_slice(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS local_meta (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL
         ) STRICT;
         CREATE TABLE IF NOT EXISTS session_projection (
           session_id TEXT PRIMARY KEY,
           partition_key TEXT NOT NULL,
           tenant_id TEXT NOT NULL,
           organization_id TEXT NOT NULL,
           team_id TEXT NOT NULL,
           title TEXT NOT NULL,
           scheduled_date TEXT NOT NULL,
           revision INTEGER NOT NULL CHECK (revision >= 0),
           selected INTEGER NOT NULL CHECK (selected IN (0, 1))
         ) STRICT;
         CREATE UNIQUE INDEX IF NOT EXISTS one_selected_session_per_partition
           ON session_projection(partition_key) WHERE selected = 1;
         CREATE TABLE IF NOT EXISTS session_blocks (
           block_id TEXT PRIMARY KEY,
           session_id TEXT NOT NULL REFERENCES session_projection(session_id) ON DELETE CASCADE,
           position INTEGER NOT NULL,
           block_type TEXT NOT NULL,
           title TEXT NOT NULL,
           duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 240),
           UNIQUE(session_id, position)
         ) STRICT;
         CREATE TABLE IF NOT EXISTS player_references (
           player_id TEXT PRIMARY KEY,
           organization_id TEXT NOT NULL,
           display_name TEXT NOT NULL
         ) STRICT;
         CREATE TABLE IF NOT EXISTS exercise_references (
           exercise_id TEXT PRIMARY KEY,
           organization_id TEXT NOT NULL,
           title TEXT NOT NULL,
           exercise_type TEXT NOT NULL
         ) STRICT;
         CREATE TABLE IF NOT EXISTS session_block_players (
           block_id TEXT NOT NULL REFERENCES session_blocks(block_id) ON DELETE CASCADE,
           player_id TEXT NOT NULL REFERENCES player_references(player_id),
           PRIMARY KEY(block_id, player_id)
         ) STRICT;
         CREATE TABLE IF NOT EXISTS session_block_exercises (
           block_id TEXT NOT NULL REFERENCES session_blocks(block_id) ON DELETE CASCADE,
           exercise_id TEXT NOT NULL REFERENCES exercise_references(exercise_id),
           PRIMARY KEY(block_id, exercise_id)
         ) STRICT;
         CREATE TABLE IF NOT EXISTS session_outbox (
           operation_id TEXT PRIMARY KEY,
           operation_type TEXT NOT NULL,
           operation_version INTEGER NOT NULL,
           client_instance_id TEXT NOT NULL,
           partition_key TEXT NOT NULL,
           tenant_id TEXT NOT NULL,
           organization_id TEXT NOT NULL,
           actor_id TEXT NOT NULL,
           session_id TEXT NOT NULL REFERENCES session_projection(session_id),
           base_revision INTEGER NOT NULL,
           resulting_revision INTEGER NOT NULL,
           payload_json TEXT NOT NULL,
           request_sha256 TEXT NOT NULL,
           state TEXT NOT NULL CHECK (state IN ('pending', 'sending')),
           attempt_count INTEGER NOT NULL DEFAULT 0,
           created_at_unix_ms INTEGER NOT NULL,
           last_attempt_at_unix_ms INTEGER
         ) STRICT;
         CREATE INDEX IF NOT EXISTS session_outbox_partition_state
           ON session_outbox(partition_key, state, created_at_unix_ms);
         CREATE TABLE IF NOT EXISTS operation_quarantine (
           operation_id TEXT PRIMARY KEY REFERENCES session_outbox(operation_id) ON DELETE CASCADE,
           reason_code TEXT NOT NULL CHECK (reason_code IN ('authorization-revoked', 'lease-expired', 'account-switched', 'tenant-denied')),
           quarantined_at_unix_ms INTEGER NOT NULL
         ) STRICT;
         CREATE TABLE IF NOT EXISTS operation_receipts (
           operation_id TEXT PRIMARY KEY,
           ack_id TEXT NOT NULL UNIQUE,
           acknowledgement TEXT NOT NULL CHECK (acknowledgement IN ('accepted', 'already-applied')),
           resulting_revision INTEGER NOT NULL,
           acknowledged_at_unix_ms INTEGER NOT NULL
         ) STRICT;
         ",
        )
        .map_err(|error| error.to_string())?;
    let has_team_id = connection
        .prepare("PRAGMA table_info(session_outbox)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|error| error.to_string())?
        .iter()
        .any(|column| column == "team_id");
    if !has_team_id {
        connection
            .execute_batch(
                "ALTER TABLE session_outbox ADD COLUMN team_id TEXT NOT NULL
               DEFAULT '00000000-0000-4000-8000-000000000401';",
            )
            .map_err(|error| error.to_string())?;
    }
    connection
        .execute(
            "INSERT INTO local_meta(key, value) VALUES ('local_schema_version', '3')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "user_version", 3)
        .map_err(|error| error.to_string())
}

fn seed_synthetic_slice(connection: &Connection) -> Result<(), String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT OR IGNORE INTO session_projection
         (session_id, partition_key, tenant_id, organization_id, team_id, title, scheduled_date, revision, selected)
         VALUES (?1, ?2, ?3, ?4, ?5, 'Synthetic MD-1 Session', '2026-09-01', 7, 1)",
        params![SYNTHETIC_SESSION_ID, SYNTHETIC_PARTITION_KEY, SYNTHETIC_TENANT_ID, SYNTHETIC_ORGANIZATION_ID, SYNTHETIC_TEAM_ID],
    ).map_err(|error| error.to_string())?;
    for (id, position, block_type, title, duration) in [
        (
            "00000000-0000-4000-8000-000000001101",
            1,
            "warmup",
            "Dynamic activation",
            15,
        ),
        (
            "00000000-0000-4000-8000-000000001102",
            2,
            "main",
            "11v11 positional game",
            30,
        ),
    ] {
        transaction.execute(
            "INSERT OR IGNORE INTO session_blocks(block_id, session_id, position, block_type, title, duration_minutes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, SYNTHETIC_SESSION_ID, position, block_type, title, duration],
        ).map_err(|error| error.to_string())?;
    }
    for (id, name) in [
        ("00000000-0000-4000-8000-000000001201", "Player One"),
        ("00000000-0000-4000-8000-000000001202", "Player Two"),
    ] {
        transaction.execute(
            "INSERT OR IGNORE INTO player_references(player_id, organization_id, display_name) VALUES (?1, ?2, ?3)",
            params![id, SYNTHETIC_ORGANIZATION_ID, name],
        ).map_err(|error| error.to_string())?;
    }
    for (id, title, exercise_type) in [
        (
            "00000000-0000-4000-8000-000000001301",
            "Activation circuit",
            "physical",
        ),
        (
            "00000000-0000-4000-8000-000000001302",
            "Positional play 8v8+3",
            "tactical",
        ),
    ] {
        transaction.execute(
            "INSERT OR IGNORE INTO exercise_references(exercise_id, organization_id, title, exercise_type) VALUES (?1, ?2, ?3, ?4)",
            params![id, SYNTHETIC_ORGANIZATION_ID, title, exercise_type],
        ).map_err(|error| error.to_string())?;
    }
    for (block_id, reference_id, table, column) in [
        (
            "00000000-0000-4000-8000-000000001101",
            "00000000-0000-4000-8000-000000001201",
            "session_block_players",
            "player_id",
        ),
        (
            "00000000-0000-4000-8000-000000001102",
            "00000000-0000-4000-8000-000000001202",
            "session_block_players",
            "player_id",
        ),
        (
            "00000000-0000-4000-8000-000000001101",
            "00000000-0000-4000-8000-000000001301",
            "session_block_exercises",
            "exercise_id",
        ),
        (
            "00000000-0000-4000-8000-000000001102",
            "00000000-0000-4000-8000-000000001302",
            "session_block_exercises",
            "exercise_id",
        ),
    ] {
        transaction
            .execute(
                &format!("INSERT OR IGNORE INTO {table}(block_id, {column}) VALUES (?1, ?2)"),
                params![block_id, reference_id],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}
