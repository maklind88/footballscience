//! Intentionally narrow projection adapter: unknown content/structural changes fail closed.
use crate::local_data::SessionSlice;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    ok: bool,
    schema: String,
    sync_protocol_version: u32,
    request_id: String,
    snapshot: Snapshot,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    schema: String,
    pub session: Session,
    pub blocks: Vec<Block>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub session_date: String,
    pub revision: i64,
    content: Value,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Block {
    pub id: String,
    pub sort_order: i64,
    revision: i64,
    pub payload: Payload,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Payload {
    pub title: String,
    pub duration_minutes: i64,
}

pub fn parse(body: &str, local: &SessionSlice) -> Result<Snapshot, String> {
    let envelope: Envelope = serde_json::from_str(body)
        .map_err(|_| "server snapshot is unsupported; local work preserved".to_string())?;
    let mut snapshot = envelope.snapshot;
    let session = &snapshot.session;
    if body.len() > 256 * 1024
        || !envelope.ok
        || envelope.schema != "fs-desktop-session-snapshot-response-v1"
        || envelope.sync_protocol_version != 1
        || envelope.request_id.is_empty()
        || envelope.request_id.len() > 200
        || envelope.request_id.chars().any(char::is_control)
        || snapshot.schema != "fs-desktop-session-snapshot-v1"
        || session.id != local.session.id
        || !(1..9_007_199_254_740_791).contains(&session.revision)
        || session.title.trim().is_empty()
        || session.title.len() > 300
        || session.session_date != local.session.scheduled_date
        || session.content != json!({"source": "synthetic-selected-slice"})
        || snapshot.blocks.len() != local.blocks.len()
        || snapshot.blocks.len() > 200
    {
        return Err(
            "server snapshot is incompatible with this selected slice; local work preserved".into(),
        );
    }
    let mut ids = HashSet::new();
    for block in &snapshot.blocks {
        if Uuid::parse_str(&block.id).is_err()
            || !ids.insert(&block.id)
            || !(1..=session.revision).contains(&block.revision)
            || !(1..=240).contains(&block.payload.duration_minutes)
            || block.payload.title.is_empty()
            || block.payload.title.len() > 300
            || !local
                .blocks
                .iter()
                .any(|b| b.id == block.id && b.position == block.sort_order)
        {
            return Err("server block structure changed; local work preserved for review".into());
        }
    }
    snapshot.blocks.sort_by_key(|b| b.sort_order);
    Ok(snapshot)
}
