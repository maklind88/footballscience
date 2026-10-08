use crate::authority::{
    SYNTHETIC_ACTOR_ID, SYNTHETIC_AUTH_EPOCH, SYNTHETIC_ORGANIZATION_ID, SYNTHETIC_PARTITION_KEY,
    SYNTHETIC_TEAM_ID, SessionAuthority, SessionContextProof,
};
use crate::local_data::{
    SYNC_PROTOCOL_VERSION, SYNTHETIC_SESSION_ID, SessionOperation, SessionOperationRequest,
    apply_operation, open,
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use std::collections::HashMap;
use std::fs;
use uuid::Uuid;

#[derive(Clone)]
struct PendingOperation {
    operation_id: String,
    operation_type: String,
    operation_version: u32,
    partition_key: String,
    organization_id: String,
    team_id: String,
    actor_id: String,
    base_revision: i64,
    resulting_revision: i64,
    request_sha256: String,
}

#[derive(Clone)]
struct ServerAcknowledgement {
    operation_id: String,
    ack_id: String,
    acknowledgement: &'static str,
    resulting_revision: i64,
}

trait SyncBoundary {
    fn push(
        &mut self,
        sync_protocol_version: u32,
        operation: &PendingOperation,
    ) -> Result<ServerAcknowledgement, String>;
}

struct SyntheticTrustedServer {
    revision: i64,
    applied: HashMap<String, (String, String, i64)>,
}

impl SyntheticTrustedServer {
    fn new(revision: i64) -> Self {
        Self {
            revision,
            applied: HashMap::new(),
        }
    }
}

impl SyncBoundary for SyntheticTrustedServer {
    fn push(
        &mut self,
        sync_protocol_version: u32,
        operation: &PendingOperation,
    ) -> Result<ServerAcknowledgement, String> {
        if sync_protocol_version != SYNC_PROTOCOL_VERSION || operation.operation_version != 1 {
            return Err("unsupported synchronization or operation version".into());
        }
        if operation.partition_key != SYNTHETIC_PARTITION_KEY
            || operation.organization_id != SYNTHETIC_ORGANIZATION_ID
            || operation.team_id != SYNTHETIC_TEAM_ID
            || operation.actor_id != SYNTHETIC_ACTOR_ID
        {
            return Err("server tenant or actor authorization rejected the operation".into());
        }
        if !matches!(
            operation.operation_type.as_str(),
            "session.rename" | "block.duration.set"
        ) {
            return Err("server operation allowlist rejected the operation".into());
        }
        if let Some((request_hash, ack_id, revision)) = self.applied.get(&operation.operation_id) {
            if request_hash != &operation.request_sha256 {
                return Err("immutable operation ID was reused with different content".into());
            }
            return Ok(ServerAcknowledgement {
                operation_id: operation.operation_id.clone(),
                ack_id: ack_id.clone(),
                acknowledgement: "already-applied",
                resulting_revision: *revision,
            });
        }
        if operation.base_revision != self.revision
            || operation.resulting_revision != self.revision + 1
        {
            return Err("authoritative server revision rejected the operation".into());
        }
        self.revision = operation.resulting_revision;
        let ack_id = Uuid::new_v4().to_string();
        self.applied.insert(
            operation.operation_id.clone(),
            (
                operation.request_sha256.clone(),
                ack_id.clone(),
                self.revision,
            ),
        );
        Ok(ServerAcknowledgement {
            operation_id: operation.operation_id.clone(),
            ack_id,
            acknowledgement: "accepted",
            resulting_revision: self.revision,
        })
    }
}

fn next_pending(connection: &Connection) -> Result<Option<PendingOperation>, String> {
    connection
        .query_row(
            "SELECT operation_id, operation_type, operation_version, partition_key,
                    organization_id, team_id, actor_id, base_revision, resulting_revision,
                    request_sha256
             FROM session_outbox
             WHERE state IN ('pending', 'sending')
               AND NOT EXISTS (
                 SELECT 1 FROM operation_quarantine quarantine
                 WHERE quarantine.operation_id = session_outbox.operation_id
               )
             ORDER BY created_at_unix_ms, operation_id
             LIMIT 1",
            [],
            |row| {
                Ok(PendingOperation {
                    operation_id: row.get(0)?,
                    operation_type: row.get(1)?,
                    operation_version: row.get(2)?,
                    partition_key: row.get(3)?,
                    organization_id: row.get(4)?,
                    team_id: row.get(5)?,
                    actor_id: row.get(6)?,
                    base_revision: row.get(7)?,
                    resulting_revision: row.get(8)?,
                    request_sha256: row.get(9)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn persist_acknowledgement(
    connection: &mut Connection,
    acknowledgement: &ServerAcknowledgement,
    acknowledged_at_unix_ms: i64,
) -> Result<(), String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO operation_receipts(operation_id, ack_id, acknowledgement, resulting_revision, acknowledged_at_unix_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(operation_id) DO NOTHING",
        params![
            acknowledgement.operation_id,
            acknowledgement.ack_id,
            acknowledgement.acknowledgement,
            acknowledgement.resulting_revision,
            acknowledged_at_unix_ms,
        ],
    ).map_err(|error| error.to_string())?;
    let receipt_exists: i64 = transaction
        .query_row(
            "SELECT count(*) FROM operation_receipts
         WHERE operation_id = ?1 AND ack_id = ?2 AND resulting_revision = ?3",
            params![
                acknowledgement.operation_id,
                acknowledgement.ack_id,
                acknowledgement.resulting_revision,
            ],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if receipt_exists != 1 {
        return Err("durable server acknowledgement did not match the pending operation".into());
    }
    transaction
        .execute(
            "DELETE FROM session_outbox WHERE operation_id = ?1",
            [&acknowledgement.operation_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn sync_one(
    connection: &mut Connection,
    server: &mut impl SyncBoundary,
    acknowledged_at_unix_ms: i64,
) -> Result<ServerAcknowledgement, String> {
    let pending = next_pending(connection)?.ok_or_else(|| "no pending operation".to_string())?;
    let acknowledgement = server.push(SYNC_PROTOCOL_VERSION, &pending)?;
    persist_acknowledgement(connection, &acknowledgement, acknowledged_at_unix_ms)?;
    Ok(acknowledgement)
}

fn database_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "fs-desktop-sync-{label}-{}.sqlite3",
        Uuid::new_v4()
    ))
}

fn request(operation_id: String) -> SessionOperationRequest {
    SessionOperationRequest {
        operation_id,
        operation_version: 1,
        client_instance_id: Uuid::new_v4().to_string(),
        session_id: SYNTHETIC_SESSION_ID.into(),
        base_revision: 7,
        context: SessionContextProof {
            actor_id: SYNTHETIC_ACTOR_ID.into(),
            organization_id: SYNTHETIC_ORGANIZATION_ID.into(),
            partition_key: SYNTHETIC_PARTITION_KEY.into(),
            auth_epoch: SYNTHETIC_AUTH_EPOCH,
            frontend_build_id: "hosted-test-v1".into(),
        },
        operation: SessionOperation::RenameSession {
            title: "Durable reconnect title".into(),
        },
    }
}

#[test]
fn reconnect_after_restart_recovers_an_accepted_but_unrecorded_ack() {
    let path = database_path("restart-ack");
    let operation_id = Uuid::new_v4().to_string();
    let mut connection = open(&path).unwrap();
    apply_operation(&mut connection, &request(operation_id.clone()), 10_000).unwrap();
    drop(connection);

    let mut server = SyntheticTrustedServer::new(7);
    let connection = open(&path).unwrap();
    let pending = next_pending(&connection).unwrap().unwrap();
    let first = server.push(SYNC_PROTOCOL_VERSION, &pending).unwrap();
    assert_eq!(first.acknowledgement, "accepted");
    drop(connection);

    let mut connection = open(&path).unwrap();
    let recovered = sync_one(&mut connection, &mut server, 20_000).unwrap();
    assert_eq!(recovered.acknowledgement, "already-applied");
    let counts: (i64, i64) = connection
        .query_row(
            "SELECT (SELECT count(*) FROM session_outbox),
                (SELECT count(*) FROM operation_receipts WHERE operation_id = ?1)",
            [&operation_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(counts, (0, 1));
    drop(connection);
    let _ = fs::remove_file(path);
}

#[test]
fn synthetic_server_rejects_an_unauthorized_partition() {
    let path = database_path("unauthorized");
    let mut connection = open(&path).unwrap();
    apply_operation(
        &mut connection,
        &request(Uuid::new_v4().to_string()),
        10_000,
    )
    .unwrap();
    let mut pending = next_pending(&connection).unwrap().unwrap();
    pending.partition_key = "another-tenant".into();
    let mut server = SyntheticTrustedServer::new(7);
    assert!(server.push(SYNC_PROTOCOL_VERSION, &pending).is_err());
    assert!(next_pending(&connection).unwrap().is_some());
    drop(connection);
    let _ = fs::remove_file(path);
}

#[test]
fn expired_offline_lease_locks_reads_without_deleting_pending_work() {
    let path = database_path("expired-lease");
    let mut connection = open(&path).unwrap();
    let operation = request(Uuid::new_v4().to_string());
    apply_operation(&mut connection, &operation, 10_000).unwrap();
    let authority = SessionAuthority::new_os_synthetic().unwrap();
    authority.expire_offline_lease_for_test();
    assert!(authority.validate(&operation.context).is_err());
    let pending: i64 = connection
        .query_row("SELECT count(*) FROM session_outbox", [], |row| row.get(0))
        .unwrap();
    assert_eq!(pending, 1);
    drop(connection);
    let _ = fs::remove_file(path);
}
