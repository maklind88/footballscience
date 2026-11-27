//! Explicit, local-only rebase. Original intent is archived atomically, never overwritten.
use crate::auth_api::DesktopAuthApi;
use crate::authority::{
    SessionAuthority, SessionAuthoritySnapshot, SessionContextProof, now_unix_ms,
};
use crate::conflict_snapshot::{self, Snapshot};
use crate::local_data::{self, SessionSlice};
use crate::sync_queue::{self, PendingOperation};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use uuid::Uuid;

struct Plan {
    local: SessionSlice,
    pending: Vec<PendingOperation>,
    remote: Snapshot,
    token: String,
}

fn queue(
    connection: &Connection,
    context: &SessionContextProof,
    authority: &SessionAuthoritySnapshot,
) -> Result<(SessionSlice, Vec<PendingOperation>), String> {
    let local = local_data::read_selected_session(connection, &context.partition_key)?;
    let status = local_data::read_session_sync_status(connection, &context.partition_key)?;
    if status.state != "conflict"
        || status.quarantined_operation_count != 0
        || !(1..=200).contains(&status.pending_operation_count)
    {
        return Err("conflict recovery requires 1-200 non-quarantined operations".into());
    }
    let mut pending: Vec<PendingOperation> = Vec::new();
    for offset in 0..status.pending_operation_count as usize {
        let item = sync_queue::pending_at(connection, &context.partition_key, offset)?
            .ok_or_else(|| "conflict queue changed".to_string())?;
        item.authorize(authority)?;
        if item.request.session_id != local.session.id
            || (offset == 0 && !item.blocked())
            || (offset > 0 && item.blocked())
            || pending
                .last()
                .is_some_and(|last| last.resulting_revision != item.request.base_revision)
        {
            return Err("conflict queue is not a recoverable revision chain".into());
        }
        // Only the head has been submitted: successors must never have reached the server.
        if offset > 0 {
            let attempts: i64 = connection
                .query_row(
                    "SELECT attempt_count FROM session_outbox WHERE operation_id = ?1",
                    [&item.request.operation_id],
                    |row| row.get(0),
                )
                .map_err(|_| "conflict attempt read failed")?;
            if attempts != 0 {
                return Err("dependent operation has uncertain server state".into());
            }
        }
        pending.push(item);
    }
    if pending.last().map(|p| p.resulting_revision) != Some(local.session.revision) {
        return Err("local projection does not match conflict queue".into());
    }
    Ok((local, pending))
}

fn plan(
    connection: &Connection,
    context: &SessionContextProof,
    authority: &SessionAuthoritySnapshot,
    body: &str,
) -> Result<Plan, String> {
    let (local, pending) = queue(connection, context, authority)?;
    let remote = conflict_snapshot::parse(body, &local)?;
    let marker: String = connection
        .query_row(
            "SELECT value FROM local_meta WHERE key = ?1",
            [format!(
                "{}{}",
                sync_queue::CONFLICT_PREFIX,
                pending[0].request.operation_id
            )],
            |r| r.get(0),
        )
        .map_err(|_| "conflict marker is unavailable")?;
    let conflict_revision = marker
        .parse::<i64>()
        .map_err(|_| "conflict marker is invalid")?;
    if remote.session.revision < conflict_revision
        || remote.session.revision <= pending[0].request.base_revision
    {
        return Err("server snapshot is older than the conflict; local work preserved".into());
    }
    let requests: Vec<_> = pending.iter().map(|p| &p.request).collect();
    let proof = serde_json::to_vec(&json!({"local": local, "remote": remote,
        "requests": requests, "context": context, "conflictRevision": conflict_revision}))
    .map_err(|_| "conflict review encoding failed")?;
    let token = format!("{:x}", Sha256::digest(&proof));
    Ok(Plan {
        local,
        pending,
        remote,
        token,
    })
}

fn view(plan: &Plan) -> Value {
    json!({"schema": "fs-desktop-conflict-review-v1", "partitionKey": plan.local.partition_key,
        "reviewToken": plan.token, "sessionId": plan.local.session.id,
        "localRevision": plan.local.session.revision, "serverRevision": plan.remote.session.revision,
        "localTitle": plan.local.session.title, "serverTitle": plan.remote.session.title,
        "blocks": plan.local.blocks.iter().zip(&plan.remote.blocks).map(|(local, remote)| json!({
            "id": local.id, "localTitle": local.title, "serverTitle": remote.payload.title,
            "localMinutes": local.duration_minutes, "serverMinutes": remote.payload.duration_minutes
        })).collect::<Vec<_>>(),
        "operations": plan.pending.iter().map(|p| json!({"operationId": p.request.operation_id,
            "baseRevision": p.request.base_revision, "operation": p.request.operation})).collect::<Vec<_>>()})
}

fn commit(
    connection: &mut Connection,
    reviewed: Plan,
    context: &SessionContextProof,
    authority: &SessionAuthoritySnapshot,
    body: &str,
) -> Result<Value, String> {
    let at = now_unix_ms()?;
    let recovery_id = Uuid::new_v4().to_string();
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "recovery transaction unavailable")?;
    // Also fence another process/connection between preview and BEGIN IMMEDIATE.
    let plan = plan(&transaction, context, authority, body)?;
    if plan.token != reviewed.token {
        return Err("conflict review changed before commit; local work preserved".into());
    }
    // Full original typed requests and projection stay durable and partition-scoped.
    // A local checkpoint is not a cloud backup or encryption-at-rest claim.
    let archive = json!({"schema": "fs-desktop-recovery-checkpoint-v1", "recoveryId": recovery_id,
        "partitionKey": context.partition_key, "createdAtUnixMs": at, "reviewToken": plan.token,
        "originalProjection": plan.local, "serverSnapshot": plan.remote,
        "originalRequests": plan.pending.iter().map(|p| &p.request).collect::<Vec<_>>()});
    transaction
        .execute(
            "INSERT INTO local_meta(key, value) VALUES (?1, ?2)",
            params![
                format!("session-recovery:{recovery_id}"),
                archive.to_string()
            ],
        )
        .map_err(|_| "original work could not be archived")?;
    for item in &plan.pending {
        transaction
            .execute(
                "INSERT INTO local_meta(key, value) VALUES (?1, ?2)",
                params![
                    format!("session-recovered-operation:{}", item.request.operation_id),
                    recovery_id
                ],
            )
            .map_err(|_| "original operation could not be retired")?;
        let removed = transaction
            .execute(
                "DELETE FROM session_outbox WHERE operation_id = ?1 AND partition_key = ?2",
                params![item.request.operation_id, context.partition_key],
            )
            .map_err(|_| "original queue could not be archived")?;
        if removed != 1 {
            return Err("original queue changed during recovery".into());
        }
        transaction
            .execute(
                "DELETE FROM local_meta WHERE key = ?1",
                [format!(
                    "{}{}",
                    sync_queue::CONFLICT_PREFIX,
                    item.request.operation_id
                )],
            )
            .map_err(|_| "conflict marker could not be retired")?;
    }
    transaction.execute("UPDATE session_projection SET title = ?1, revision = ?2 WHERE session_id = ?3 AND partition_key = ?4",
        params![plan.remote.session.title, plan.remote.session.revision, plan.local.session.id, context.partition_key])
        .map_err(|_| "reviewed server projection could not be installed")?;
    for block in &plan.remote.blocks {
        transaction.execute("UPDATE session_blocks SET title = ?1, duration_minutes = ?2 WHERE block_id = ?3 AND session_id = ?4",
            params![block.payload.title, block.payload.duration_minutes, block.id, plan.local.session.id])
            .map_err(|_| "reviewed server block could not be installed")?;
    }
    let mut replacements = Vec::new();
    for (index, item) in plan.pending.into_iter().enumerate() {
        let mut request = item.request;
        let original_id = request.operation_id;
        request.operation_id = Uuid::new_v4().to_string();
        request.base_revision = plan.remote.session.revision + index as i64;
        request.context =
            serde_json::from_value(json!(context)).map_err(|_| "recovery context invalid")?;
        local_data::apply_in_transaction(&transaction, &request, at)?;
        replacements.push(
            json!({"originalOperationId": original_id, "newOperationId": request.operation_id}),
        );
    }
    transaction
        .execute(
            "INSERT INTO local_meta(key, value) VALUES (?1, ?2)",
            params![
                format!("session-recovery-replacements:{recovery_id}"),
                json!(replacements).to_string()
            ],
        )
        .map_err(|_| "recovery mapping could not be preserved")?;
    let receipt = json!({"schema": "fs-desktop-conflict-recovered-v1", "partitionKey": context.partition_key,
        "recoveryId": recovery_id, "requeuedOperationCount": replacements.len(), "uploaded": false});
    transaction
        .execute(
            "INSERT INTO local_meta(key, value) VALUES (?1, ?2)",
            params![
                format!("session-recovery-result:{}", plan.token),
                json!({"context": context, "receipt": receipt}).to_string()
            ],
        )
        .map_err(|_| "recovery receipt could not be preserved")?;
    transaction
        .commit()
        .map_err(|_| "recovery checkpoint commit failed")?;
    Ok(receipt)
}

fn completed(
    connection: &Connection,
    token: &str,
    context: &SessionContextProof,
) -> Result<Option<Value>, String> {
    let stored: Option<String> = connection
        .query_row(
            "SELECT value FROM local_meta WHERE key = ?1",
            [format!("session-recovery-result:{token}")],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "recovery receipt read failed")?;
    let Some(stored) = stored else {
        return Ok(None);
    };
    if stored.len() > 4096 {
        return Err("recovery receipt exceeds bound".into());
    }
    let stored: Value = serde_json::from_str(&stored).map_err(|_| "invalid recovery receipt")?;
    let receipt = &stored["receipt"];
    if stored["context"] != json!(context)
        || receipt["schema"] != "fs-desktop-conflict-recovered-v1"
        || receipt["partitionKey"] != context.partition_key
        || receipt["uploaded"] != false
        || receipt["recoveryId"]
            .as_str()
            .is_none_or(|id| Uuid::parse_str(id).is_err())
        || receipt["requeuedOperationCount"]
            .as_u64()
            .is_none_or(|n| !(1..=200).contains(&n))
    {
        return Err("recovery receipt does not match active review context".into());
    }
    Ok(Some(receipt.clone()))
}

pub fn run(
    api: &DesktopAuthApi,
    authority: &Mutex<SessionAuthority>,
    connection: &Mutex<Connection>,
    owner: &Mutex<()>,
    context: &SessionContextProof,
    review_token: Option<&str>,
    validate_shell: impl Fn() -> Result<(), String>,
) -> Result<Value, String> {
    if review_token.is_some_and(|t| {
        t.len() != 64
            || !t
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    }) {
        return Err("invalid conflict review token".into());
    }
    let _owner = owner
        .try_lock()
        .map_err(|_| "desktop synchronization is already running")?;
    let (session_id, token) = {
        let auth = authority
            .lock()
            .map_err(|_| "session authority lock poisoned")?;
        auth.validate(context)?;
        validate_shell()?;
        let db = connection
            .lock()
            .map_err(|_| "local database lock poisoned")?;
        let token = auth.access_token()?;
        if let Some(review_token) = review_token
            && let Some(receipt) = completed(&db, review_token, context)?
        {
            return Ok(receipt);
        }
        let (local, _) = queue(&db, context, &auth.snapshot())?;
        (local.session.id, token)
    };
    let response = api.read_session_snapshot(&session_id, token.as_str());
    let auth = authority
        .lock()
        .map_err(|_| "session authority lock poisoned")?;
    auth.validate(context)?;
    validate_shell()?;
    if auth.access_token()?.as_str() != token.as_str() {
        return Err("credential changed; reopen conflict review".into());
    }
    let response = response?;
    if response.status != 200 {
        return Err("server review unavailable; local work preserved".into());
    }
    let mut db = connection
        .lock()
        .map_err(|_| "local database lock poisoned")?;
    let plan = plan(&db, context, &auth.snapshot(), &response.body)?;
    if let Some(review_token) = review_token {
        if plan.token != review_token {
            return Err("conflict review changed; review again before recovery".into());
        }
        commit(&mut db, plan, context, &auth.snapshot(), &response.body)
    } else {
        Ok(view(&plan))
    }
}
