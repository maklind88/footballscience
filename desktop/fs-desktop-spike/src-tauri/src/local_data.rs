use crate::authority::{
    SYNTHETIC_ORGANIZATION_ID, SYNTHETIC_TEAM_ID, SYNTHETIC_TENANT_ID, SessionContextProof,
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(test)]
use std::fs;
use std::path::Path;
use uuid::Uuid;

pub const LOCAL_SCHEMA_VERSION: u32 = 3;
pub const SYNC_PROTOCOL_VERSION: u32 = 1;
pub const SYNTHETIC_SESSION_ID: &str = "00000000-0000-4000-8000-000000001001";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSlice {
    pub projection_schema: &'static str,
    pub synthetic_fixture: bool,
    pub partition_key: String,
    pub tenant_id: String,
    pub organization_id: String,
    pub team_id: String,
    pub session: SessionRecord,
    pub blocks: Vec<SessionBlock>,
    pub players: Vec<PlayerReference>,
    pub exercises: Vec<ExerciseReference>,
    pub excluded_fields: [&'static str; 3],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub title: String,
    pub scheduled_date: String,
    pub revision: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionBlock {
    pub id: String,
    pub position: i64,
    pub block_type: String,
    pub title: String,
    pub duration_minutes: i64,
    pub player_ids: Vec<String>,
    pub exercise_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerReference {
    pub id: String,
    pub display_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseReference {
    pub id: String,
    pub title: String,
    pub exercise_type: String,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "operationType", rename_all = "camelCase", deny_unknown_fields)]
pub enum SessionOperation {
    #[serde(rename = "session.rename")]
    RenameSession { title: String },
    #[serde(rename = "block.duration.set")]
    SetBlockDuration {
        block_id: String,
        duration_minutes: i64,
    },
}

impl SessionOperation {
    fn operation_type(&self) -> &'static str {
        match self {
            Self::RenameSession { .. } => "session.rename",
            Self::SetBlockDuration { .. } => "block.duration.set",
        }
    }

    fn validate(&self) -> Result<(), String> {
        match self {
            Self::RenameSession { title } if title.trim().is_empty() || title.len() > 120 => {
                Err("session title must contain 1-120 characters".into())
            }
            Self::SetBlockDuration {
                block_id,
                duration_minutes,
            } => {
                validate_uuid(block_id, "block ID")?;
                if !(1..=240).contains(duration_minutes) {
                    return Err("block duration must be 1-240 minutes".into());
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionOperationRequest {
    pub operation_id: String,
    pub operation_version: u32,
    pub client_instance_id: String,
    pub session_id: String,
    pub base_revision: i64,
    pub context: SessionContextProof,
    pub operation: SessionOperation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationReceipt {
    pub operation_id: String,
    pub state: &'static str,
    pub resulting_revision: i64,
    pub durable_locally: bool,
}

pub fn open(path: &Path) -> Result<Connection, String> {
    crate::local_schema::open(path)
}

pub fn read_selected_session(
    connection: &Connection,
    partition_key: &str,
) -> Result<SessionSlice, String> {
    let session = connection
        .query_row(
            "SELECT session_id, title, scheduled_date, revision FROM session_projection
         WHERE partition_key = ?1 AND selected = 1",
            [partition_key],
            |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    scheduled_date: row.get(2)?,
                    revision: row.get(3)?,
                })
            },
        )
        .map_err(|error| error.to_string())?;
    let mut block_statement = connection
        .prepare(
            "SELECT block_id, position, block_type, title, duration_minutes FROM session_blocks
         WHERE session_id = ?1 ORDER BY position",
        )
        .map_err(|error| error.to_string())?;
    let blocks = block_statement
        .query_map([&session.id], |row| {
            let block_id: String = row.get(0)?;
            Ok(SessionBlock {
                player_ids: string_column(
                    connection,
                    "session_block_players",
                    "player_id",
                    &block_id,
                )?,
                exercise_ids: string_column(
                    connection,
                    "session_block_exercises",
                    "exercise_id",
                    &block_id,
                )?,
                id: block_id,
                position: row.get(1)?,
                block_type: row.get(2)?,
                title: row.get(3)?,
                duration_minutes: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(SessionSlice {
        projection_schema: "fs-session-planner-offline-projection-v1",
        synthetic_fixture: true,
        partition_key: partition_key.into(),
        tenant_id: SYNTHETIC_TENANT_ID.into(),
        organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
        team_id: SYNTHETIC_TEAM_ID.into(),
        session,
        blocks,
        players: read_players(connection)?,
        exercises: read_exercises(connection)?,
        excluded_fields: ["video_blob", "medical_data", "authentication_credentials"],
    })
}

fn string_column(
    connection: &Connection,
    table: &str,
    column: &str,
    block_id: &str,
) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {column} FROM {table} WHERE block_id = ?1 ORDER BY {column}"
    ))?;
    statement.query_map([block_id], |row| row.get(0))?.collect()
}

fn read_players(connection: &Connection) -> Result<Vec<PlayerReference>, String> {
    let mut statement = connection.prepare(
        "SELECT player_id, display_name FROM player_references WHERE organization_id = ?1 ORDER BY player_id",
    ).map_err(|error| error.to_string())?;
    statement
        .query_map([SYNTHETIC_ORGANIZATION_ID], |row| {
            Ok(PlayerReference {
                id: row.get(0)?,
                display_name: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn read_exercises(connection: &Connection) -> Result<Vec<ExerciseReference>, String> {
    let mut statement = connection.prepare(
        "SELECT exercise_id, title, exercise_type FROM exercise_references WHERE organization_id = ?1 ORDER BY exercise_id",
    ).map_err(|error| error.to_string())?;
    statement
        .query_map([SYNTHETIC_ORGANIZATION_ID], |row| {
            Ok(ExerciseReference {
                id: row.get(0)?,
                title: row.get(1)?,
                exercise_type: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn apply_operation(
    connection: &mut Connection,
    request: &SessionOperationRequest,
    created_at_ms: u128,
) -> Result<OperationReceipt, String> {
    validate_uuid(&request.operation_id, "operation ID")?;
    validate_uuid(&request.client_instance_id, "client instance ID")?;
    validate_uuid(&request.session_id, "session ID")?;
    if request.operation_version != 1 {
        return Err("unsupported operation version".into());
    }
    request.operation.validate()?;
    let request_json = serde_json::to_string(request).map_err(|error| error.to_string())?;
    let request_hash = hex_sha256(request_json.as_bytes());
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    if let Some((stored_hash, revision)) = transaction
        .query_row(
            "SELECT request_sha256, resulting_revision FROM session_outbox WHERE operation_id = ?1",
            [&request.operation_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?
    {
        if stored_hash != request_hash {
            return Err("operation ID was reused with different content".into());
        }
        return Ok(OperationReceipt {
            operation_id: request.operation_id.clone(),
            state: "already-pending",
            resulting_revision: revision,
            durable_locally: true,
        });
    }
    let revision: i64 = transaction.query_row(
        "SELECT revision FROM session_projection WHERE session_id = ?1 AND partition_key = ?2 AND organization_id = ?3",
        params![request.session_id, request.context.partition_key, request.context.organization_id], |row| row.get(0),
    ).map_err(|_| "session is outside the authorized local partition".to_string())?;
    if revision != request.base_revision {
        return Err(format!("stale base revision: expected {revision}"));
    }
    match &request.operation {
        SessionOperation::RenameSession { title } => {
            transaction.execute("UPDATE session_projection SET title = ?1, revision = revision + 1 WHERE session_id = ?2", params![title.trim(), request.session_id])
                .map_err(|error| error.to_string())?;
        }
        SessionOperation::SetBlockDuration {
            block_id,
            duration_minutes,
        } => {
            let changed = transaction.execute(
                "UPDATE session_blocks SET duration_minutes = ?1 WHERE block_id = ?2 AND session_id = ?3",
                params![duration_minutes, block_id, request.session_id],
            ).map_err(|error| error.to_string())?;
            if changed != 1 {
                return Err("block is outside the selected session".into());
            }
            transaction
                .execute(
                    "UPDATE session_projection SET revision = revision + 1 WHERE session_id = ?1",
                    [&request.session_id],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    let resulting_revision = revision + 1;
    let created_at = i64::try_from(created_at_ms).map_err(|_| "timestamp overflow".to_string())?;
    transaction.execute(
        "INSERT INTO session_outbox(operation_id, operation_type, operation_version, client_instance_id,
         partition_key, tenant_id, organization_id, team_id, actor_id, session_id, base_revision, resulting_revision,
         payload_json, request_sha256, state, created_at_unix_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'pending', ?15)",
        params![request.operation_id, request.operation.operation_type(), request.operation_version,
            request.client_instance_id, request.context.partition_key, SYNTHETIC_TENANT_ID,
            request.context.organization_id, SYNTHETIC_TEAM_ID, request.context.actor_id, request.session_id,
            request.base_revision, resulting_revision, request_json, request_hash, created_at],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(OperationReceipt {
        operation_id: request.operation_id.clone(),
        state: "pending",
        resulting_revision,
        durable_locally: true,
    })
}

#[allow(
    dead_code,
    reason = "the local sync transport will call this after the authenticated backend is authorized"
)]
pub fn quarantine_operation(
    connection: &Connection,
    operation_id: &str,
    reason_code: &str,
    quarantined_at_ms: u128,
) -> Result<(), String> {
    validate_uuid(operation_id, "operation ID")?;
    if !matches!(
        reason_code,
        "authorization-revoked" | "lease-expired" | "account-switched" | "tenant-denied"
    ) {
        return Err("unsupported operation quarantine reason".into());
    }
    let timestamp =
        i64::try_from(quarantined_at_ms).map_err(|_| "timestamp overflow".to_string())?;
    let changed = connection
        .execute(
            "INSERT INTO operation_quarantine(operation_id, reason_code, quarantined_at_unix_ms)
             SELECT operation_id, ?2, ?3 FROM session_outbox WHERE operation_id = ?1
             ON CONFLICT(operation_id) DO UPDATE SET
               reason_code = excluded.reason_code,
               quarantined_at_unix_ms = excluded.quarantined_at_unix_ms",
            params![operation_id, reason_code, timestamp],
        )
        .map_err(|error| error.to_string())?;
    if changed != 1 {
        return Err("pending operation not found for quarantine".into());
    }
    Ok(())
}

#[cfg(test)]
pub fn acknowledge_test_operation(
    connection: &mut Connection,
    operation_id: &str,
    ack_id: &str,
    at_ms: u128,
) -> Result<(), String> {
    validate_uuid(operation_id, "operation ID")?;
    validate_uuid(ack_id, "ack ID")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let revision: i64 = transaction
        .query_row(
            "SELECT resulting_revision FROM session_outbox WHERE operation_id = ?1",
            [operation_id],
            |row| row.get(0),
        )
        .map_err(|_| "pending operation not found".to_string())?;
    transaction.execute(
        "INSERT INTO operation_receipts(operation_id, ack_id, acknowledgement, resulting_revision, acknowledged_at_unix_ms)
         VALUES (?1, ?2, 'accepted', ?3, ?4)",
        params![operation_id, ack_id, revision, i64::try_from(at_ms).map_err(|_| "timestamp overflow".to_string())?],
    ).map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM session_outbox WHERE operation_id = ?1",
            [operation_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn validate_uuid(value: &str, label: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| format!("invalid {label}"))
}

fn hex_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authority::{
        SYNTHETIC_ACTOR_ID, SYNTHETIC_AUTH_EPOCH, SYNTHETIC_PARTITION_KEY, SessionContextProof,
    };

    fn database_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("fs-desktop-{label}-{}.sqlite3", Uuid::new_v4()))
    }

    fn request(revision: i64) -> SessionOperationRequest {
        SessionOperationRequest {
            operation_id: Uuid::new_v4().to_string(),
            operation_version: 1,
            client_instance_id: Uuid::new_v4().to_string(),
            session_id: SYNTHETIC_SESSION_ID.into(),
            base_revision: revision,
            context: SessionContextProof {
                actor_id: SYNTHETIC_ACTOR_ID.into(),
                organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
                partition_key: SYNTHETIC_PARTITION_KEY.into(),
                auth_epoch: SYNTHETIC_AUTH_EPOCH,
                frontend_build_id: "test-build".into(),
            },
            operation: SessionOperation::RenameSession {
                title: "Persisted restart title".into(),
            },
        }
    }

    #[test]
    fn projection_and_outbox_survive_connection_restart() {
        let path = database_path("restart");
        let mut connection = open(&path).unwrap();
        let receipt = apply_operation(&mut connection, &request(7), 10_000).unwrap();
        assert_eq!(receipt.resulting_revision, 8);
        drop(connection);
        let connection = open(&path).unwrap();
        let slice = read_selected_session(&connection, SYNTHETIC_PARTITION_KEY).unwrap();
        assert_eq!(slice.session.title, "Persisted restart title");
        let pending: i64 = connection
            .query_row("SELECT count(*) FROM session_outbox", [], |row| row.get(0))
            .unwrap();
        assert_eq!(pending, 1);
        drop(connection);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn invalid_revision_rolls_back_projection_and_outbox() {
        let path = database_path("rollback");
        let mut connection = open(&path).unwrap();
        assert!(apply_operation(&mut connection, &request(2), 10_000).is_err());
        let slice = read_selected_session(&connection, SYNTHETIC_PARTITION_KEY).unwrap();
        assert_eq!(slice.session.revision, 7);
        let pending: i64 = connection
            .query_row("SELECT count(*) FROM session_outbox", [], |row| row.get(0))
            .unwrap();
        assert_eq!(pending, 0);
        drop(connection);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn durable_ack_receipt_precedes_outbox_removal() {
        let path = database_path("ack");
        let mut connection = open(&path).unwrap();
        let operation = request(7);
        apply_operation(&mut connection, &operation, 10_000).unwrap();
        let ack_id = Uuid::new_v4().to_string();
        acknowledge_test_operation(&mut connection, &operation.operation_id, &ack_id, 20_000)
            .unwrap();
        let pending: i64 = connection
            .query_row("SELECT count(*) FROM session_outbox", [], |row| row.get(0))
            .unwrap();
        let receipts: i64 = connection
            .query_row("SELECT count(*) FROM operation_receipts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!((pending, receipts), (0, 1));
        drop(connection);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn schema_contains_no_refresh_token_column() {
        let path = database_path("credentials");
        let connection = open(&path).unwrap();
        let schema: String = connection
            .query_row(
                "SELECT group_concat(sql, '\n') FROM sqlite_schema WHERE sql IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!schema.to_lowercase().contains("refresh_token"));
        drop(connection);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn revoked_authority_quarantines_without_deleting_pending_work() {
        let path = database_path("quarantine");
        let mut connection = open(&path).unwrap();
        let operation = request(7);
        apply_operation(&mut connection, &operation, 10_000).unwrap();
        quarantine_operation(
            &connection,
            &operation.operation_id,
            "authorization-revoked",
            20_000,
        )
        .unwrap();
        let counts: (i64, i64) = connection
            .query_row(
                "SELECT (SELECT count(*) FROM session_outbox),
                        (SELECT count(*) FROM operation_quarantine)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(counts, (1, 1));
        drop(connection);
        let _ = fs::remove_file(path);
    }
}
