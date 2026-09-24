//! Native-owned immutable queue selection and correlated acknowledgement commits.
use crate::authority::SessionAuthoritySnapshot;
use crate::local_data::{SessionOperation, SessionOperationRequest};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;

const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;
pub const CONFLICT_PREFIX: &str = "session-sync-conflict:";

pub struct PendingOperation {
    pub request: SessionOperationRequest,
    pub resulting_revision: i64,
    hash: String,
    quarantined: bool,
    conflicted: bool,
    tenant_id: String,
    team_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Acknowledgement {
    ok: bool,
    schema: String,
    sync_protocol_version: u32,
    request_id: String,
    operation_id: String,
    pub acknowledgement: String,
    acknowledgement_id: Option<String>,
    pub resulting_revision: i64,
    result: serde_json::Value,
}

pub fn next_pending(
    connection: &Connection,
    partition: &str,
) -> Result<Option<PendingOperation>, String> {
    // Include blocked rows: skipping a predecessor would upload its dependent revisions.
    let row = connection
        .query_row(
            "SELECT o.operation_id, o.operation_type, o.operation_version, o.client_instance_id,
         o.partition_key, o.organization_id, o.actor_id, o.session_id, o.base_revision,
         o.resulting_revision, o.payload_json, o.request_sha256, o.tenant_id, o.team_id,
         EXISTS(SELECT 1 FROM operation_quarantine q WHERE q.operation_id = o.operation_id),
         EXISTS(SELECT 1 FROM local_meta m WHERE m.key = 'session-sync-conflict:' || o.operation_id)
         FROM session_outbox o JOIN session_projection s ON s.session_id = o.session_id
         WHERE o.partition_key = ?1 AND s.partition_key = ?1 AND s.selected = 1
         ORDER BY o.base_revision, o.operation_id LIMIT 1",
            [partition],
            |row| {
                Ok((
                    row.get::<_, String>(10)?,
                    row.get::<_, String>(11)?,
                    (
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, u32>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, i64>(8)?,
                    ),
                    row.get::<_, i64>(9)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, bool>(14)?,
                    row.get::<_, bool>(15)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "desktop sync queue read failed".to_string())?;
    let Some((encoded, hash, columns, revision, tenant_id, team_id, quarantined, conflicted)) = row
    else {
        return Ok(None);
    };
    if encoded.len() > 32 * 1024 || format!("{:x}", Sha256::digest(encoded.as_bytes())) != hash {
        return Err("desktop sync queue integrity check failed".into());
    }
    let request: SessionOperationRequest = serde_json::from_str(&encoded)
        .map_err(|_| "desktop sync queue payload is invalid".to_string())?;
    let actual = (
        request.operation_id.clone(),
        request.operation.operation_type().to_string(),
        request.operation_version,
        request.client_instance_id.clone(),
        request.context.partition_key.clone(),
        request.context.organization_id.clone(),
        request.context.actor_id.clone(),
        request.session_id.clone(),
        request.base_revision,
    );
    if actual != columns
        || request.operation_version != 1
        || !(1..MAX_SAFE_INTEGER).contains(&request.base_revision)
        || request.base_revision + 1 != revision
    {
        return Err("desktop sync queue columns do not match immutable payload".into());
    }
    for id in [
        &request.operation_id,
        &request.client_instance_id,
        &request.session_id,
    ] {
        Uuid::parse_str(id).map_err(|_| "desktop sync queue identity is invalid".to_string())?;
    }
    request.operation.validate()?;
    Ok(Some(PendingOperation {
        request,
        resulting_revision: revision,
        hash,
        quarantined,
        conflicted,
        tenant_id,
        team_id,
    }))
}

impl PendingOperation {
    pub fn blocked(&self) -> bool {
        self.quarantined || self.conflicted
    }

    pub fn authorize(&self, snapshot: &SessionAuthoritySnapshot) -> Result<(), String> {
        let proof = &self.request.context;
        if !snapshot.can_sync
            || !snapshot.can_read_offline
            || proof.actor_id != snapshot.actor_id
            || proof.organization_id != snapshot.organization_id
            || proof.partition_key != snapshot.partition_key
            || proof.auth_epoch != snapshot.auth_epoch
            || self.tenant_id != snapshot.tenant_id
            || self.team_id != snapshot.team_id
        {
            return Err("queued operation does not match current native authority".into());
        }
        Ok(())
    }

    pub fn wire_body(&self) -> Result<String, String> {
        let payload = match &self.request.operation {
            SessionOperation::RenameSession { title } => json!({ "title": title.trim() }),
            SessionOperation::SetBlockDuration {
                block_id,
                duration_minutes,
            } => json!({ "blockId": block_id, "durationMinutes": duration_minutes }),
        };
        serde_json::to_string(&json!({
            "schema": "fs-desktop-session-sync-request-v1", "syncProtocolVersion": 1,
            "clientInstanceId": self.request.client_instance_id, "authEpoch": self.request.context.auth_epoch,
            "operation": { "operationId": self.request.operation_id,
                "operationType": self.request.operation.operation_type(), "operationVersion": 1,
                "sessionId": self.request.session_id, "baseRevision": self.request.base_revision, "payload": payload }
        })).map_err(|_| "desktop sync encoding failed".into())
    }
}

pub fn parse_ack(body: &str, pending: &PendingOperation) -> Result<Acknowledgement, String> {
    let ack: Acknowledgement = serde_json::from_str(body)
        .map_err(|_| "desktop sync acknowledgement is malformed".to_string())?;
    if !ack.ok
        || ack.schema != "fs-desktop-session-sync-response-v1"
        || ack.sync_protocol_version != 1
        || ack.operation_id != pending.request.operation_id
        || ack.request_id.is_empty()
        || ack.request_id.len() > 200
        || ack.request_id.chars().any(char::is_control)
        || !ack.result.is_object()
        || !(1..=MAX_SAFE_INTEGER).contains(&ack.resulting_revision)
        || !matches!(
            ack.acknowledgement.as_str(),
            "accepted" | "already-applied" | "conflict"
        )
    {
        return Err("desktop sync acknowledgement is not correlated".into());
    }
    if ack.acknowledgement != "conflict"
        && (ack.resulting_revision != pending.resulting_revision
            || ack
                .acknowledgement_id
                .as_deref()
                .is_none_or(|id| Uuid::parse_str(id).is_err()))
    {
        return Err("desktop sync acknowledgement revision or identity is invalid".into());
    }
    Ok(ack)
}

pub fn mark_attempt(
    connection: &Connection,
    pending: &PendingOperation,
    at: i64,
) -> Result<(), String> {
    let changed = connection
        .execute(
            "UPDATE session_outbox SET state = 'sending', attempt_count = attempt_count + 1,
         last_attempt_at_unix_ms = ?3 WHERE operation_id = ?1 AND request_sha256 = ?2",
            params![pending.request.operation_id, pending.hash, at],
        )
        .map_err(|_| "desktop sync attempt could not be recorded".to_string())?;
    if changed != 1 {
        return Err("desktop sync operation changed before sending".into());
    }
    Ok(())
}

pub fn commit_ack(
    connection: &mut Connection,
    pending: &PendingOperation,
    ack: &Acknowledgement,
    at: i64,
) -> Result<(), String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "desktop sync receipt transaction failed".to_string())?;
    let current = next_pending(&transaction, &pending.request.context.partition_key)?
        .ok_or_else(|| "desktop sync operation disappeared".to_string())?;
    if current.request.operation_id != pending.request.operation_id
        || current.hash != pending.hash
        || current.blocked()
    {
        return Err("desktop sync operation changed while awaiting response".into());
    }
    if ack.acknowledgement == "conflict" {
        // Persist only a bounded revision marker, never server payload or credentials.
        transaction
            .execute(
                "INSERT INTO local_meta(key, value) VALUES (?1, ?2)",
                params![
                    format!("{CONFLICT_PREFIX}{}", pending.request.operation_id),
                    ack.resulting_revision.to_string()
                ],
            )
            .map_err(|_| "desktop sync conflict could not be preserved".to_string())?;
    } else {
        transaction.execute(
            "INSERT INTO operation_receipts(operation_id, ack_id, acknowledgement, resulting_revision, acknowledged_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![pending.request.operation_id, ack.acknowledgement_id, ack.acknowledgement, ack.resulting_revision, at])
            .map_err(|_| "desktop sync receipt could not be preserved".to_string())?;
        let deleted = transaction
            .execute(
                "DELETE FROM session_outbox WHERE operation_id = ?1 AND request_sha256 = ?2",
                params![pending.request.operation_id, pending.hash],
            )
            .map_err(|_| "desktop sync queue commit failed".to_string())?;
        if deleted != 1 {
            return Err("desktop sync queue commit was not exact".into());
        }
    }
    transaction
        .commit()
        .map_err(|_| "desktop sync receipt commit failed".into())
}
