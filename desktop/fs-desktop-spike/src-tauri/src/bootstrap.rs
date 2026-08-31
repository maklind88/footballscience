use crate::authority::now_unix_ms;
use crate::local_data::{LOCAL_SCHEMA_VERSION, SYNC_PROTOCOL_VERSION};
use crate::shell_contract;
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use uuid::Uuid;

pub const SHELL_SOURCE_ORIGIN: &str = "http://127.0.0.1:47842";
pub const NATIVE_APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const APP_READY_SCHEMA: &str = "fs-desktop-app-ready-v1";
pub const MANIFEST_SCHEMA: &str = "fs-desktop-shell-manifest-v1";
pub const RUNTIME_CAPABILITIES: [&str; 7] = [
    "bootstrap.confirm",
    "bootstrap.status",
    "bootstrap.update",
    "runtime.info",
    "session.operation",
    "session.read",
    "spike.probe",
];

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShellAsset {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
    pub content_type: String,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShellManifest {
    pub schema: String,
    pub build_id: String,
    pub frontend_build_id: String,
    pub native_version_requirement: String,
    pub local_schema_version: u32,
    pub sync_protocol_version: u32,
    pub required_capabilities: Vec<String>,
    pub entrypoint: String,
    pub app_ready_schema: String,
    pub assets: Vec<ShellAsset>,
}

#[derive(Clone)]
pub struct CandidateShell {
    pub manifest: ShellManifest,
    pub health_nonce: String,
}

#[derive(Clone, Default)]
pub struct ShellState {
    pub active: Option<ShellManifest>,
    pub previous: Option<ShellManifest>,
    pub candidate: Option<CandidateShell>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapStatus {
    pub schema: &'static str,
    pub native_app_version: &'static str,
    pub local_schema_version: u32,
    pub sync_protocol_version: u32,
    pub active_build_id: Option<String>,
    pub previous_build_id: Option<String>,
    pub candidate_build_id: Option<String>,
    pub candidate_health_nonce: Option<String>,
    pub required_capabilities: Vec<&'static str>,
    pub fallback_available: bool,
    pub source_origin: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareResult {
    pub state: &'static str,
    pub build_id: String,
    pub health_nonce: Option<String>,
    pub assets_verified: usize,
    pub source_origin: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppReadyEvidence {
    pub schema: String,
    pub build_id: String,
    pub frontend_build_id: String,
    pub local_schema_version: u32,
    pub sync_protocol_version: u32,
    pub capabilities: Vec<String>,
    pub shell_fully_initialized: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfirmCandidateRequest {
    pub build_id: String,
    pub health_nonce: String,
    pub evidence: AppReadyEvidence,
}

pub fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS shell_generations (
           build_id TEXT PRIMARY KEY,
           manifest_json TEXT NOT NULL,
           manifest_sha256 TEXT NOT NULL,
           status TEXT NOT NULL CHECK (status IN ('candidate', 'active', 'previous', 'retained')),
           installed_at_unix_ms INTEGER NOT NULL,
           promoted_at_unix_ms INTEGER
         ) STRICT;
         CREATE TABLE IF NOT EXISTS shell_registry (
           singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
           active_build_id TEXT REFERENCES shell_generations(build_id),
           previous_build_id TEXT REFERENCES shell_generations(build_id),
           candidate_build_id TEXT REFERENCES shell_generations(build_id)
         ) STRICT;
         INSERT OR IGNORE INTO shell_registry(singleton) VALUES (1);",
        )
        .map_err(|error| error.to_string())
}

pub fn load_state(connection: &Connection) -> Result<ShellState, String> {
    let identifiers = connection.query_row(
        "SELECT active_build_id, previous_build_id, candidate_build_id FROM shell_registry WHERE singleton = 1",
        [],
        |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, Option<String>>(2)?)),
    ).map_err(|error| error.to_string())?;
    Ok(ShellState {
        active: load_manifest(connection, identifiers.0.as_deref())?,
        previous: load_manifest(connection, identifiers.1.as_deref())?,
        candidate: load_manifest(connection, identifiers.2.as_deref())?.map(|manifest| {
            CandidateShell {
                manifest,
                health_nonce: Uuid::new_v4().to_string(),
            }
        }),
    })
}

fn load_manifest(
    connection: &Connection,
    build_id: Option<&str>,
) -> Result<Option<ShellManifest>, String> {
    let Some(build_id) = build_id else {
        return Ok(None);
    };
    let json = connection
        .query_row(
            "SELECT manifest_json FROM shell_generations WHERE build_id = ?1",
            [build_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    json.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string()))
        .transpose()
}

pub fn status(state: &ShellState) -> BootstrapStatus {
    BootstrapStatus {
        schema: "fs-desktop-bootstrap-status-v1",
        native_app_version: NATIVE_APP_VERSION,
        local_schema_version: LOCAL_SCHEMA_VERSION,
        sync_protocol_version: SYNC_PROTOCOL_VERSION,
        active_build_id: state.active.as_ref().map(|item| item.build_id.clone()),
        previous_build_id: state.previous.as_ref().map(|item| item.build_id.clone()),
        candidate_build_id: state
            .candidate
            .as_ref()
            .map(|item| item.manifest.build_id.clone()),
        candidate_health_nonce: state
            .candidate
            .as_ref()
            .map(|item| item.health_nonce.clone()),
        required_capabilities: RUNTIME_CAPABILITIES.to_vec(),
        fallback_available: true,
        source_origin: SHELL_SOURCE_ORIGIN,
    }
}

pub fn download_and_stage(
    root: &Path,
    connection: &mut Connection,
    state: &mut ShellState,
) -> Result<PrepareResult, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(8))
        .redirect(Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let manifest_bytes = shell_contract::bounded_get(
        &client,
        &format!("{SHELL_SOURCE_ORIGIN}/manifest.json"),
        65_536,
    )?;
    let manifest: ShellManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("invalid shell manifest: {error}"))?;
    shell_contract::validate_manifest(&manifest)?;
    if incoming_is_current(state, &manifest)? {
        return Ok(PrepareResult {
            state: "up-to-date",
            build_id: manifest.build_id,
            health_nonce: None,
            assets_verified: manifest.assets.len(),
            source_origin: SHELL_SOURCE_ORIGIN,
        });
    }
    let generation_root = root.join("shell-generations");
    fs::create_dir_all(&generation_root).map_err(|error| error.to_string())?;
    let final_path = generation_root.join(&manifest.build_id);
    let pending_path = generation_root.join(format!("{}.pending", manifest.build_id));
    if pending_path.exists() {
        fs::remove_dir_all(&pending_path).map_err(|error| error.to_string())?;
    }
    fs::create_dir(&pending_path).map_err(|error| error.to_string())?;
    for asset in &manifest.assets {
        let url = format!("{SHELL_SOURCE_ORIGIN}/{}", asset.path);
        let bytes = shell_contract::bounded_get(&client, &url, asset.bytes as usize)?;
        shell_contract::verify_asset(asset, &bytes)?;
        shell_contract::durable_write(&pending_path.join(&asset.path), &bytes)?;
    }
    let manifest_json = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    shell_contract::durable_write(&pending_path.join("manifest.json"), &manifest_json)?;
    if final_path.exists() {
        shell_contract::verify_generation(&final_path, &manifest)?;
        fs::remove_dir_all(&pending_path).map_err(|error| error.to_string())?;
    } else {
        fs::rename(&pending_path, &final_path).map_err(|error| error.to_string())?;
    }
    shell_contract::verify_generation(&final_path, &manifest)?;
    let health_nonce = Uuid::new_v4().to_string();
    let now = i64::try_from(now_unix_ms()?).map_err(|_| "timestamp overflow".to_string())?;
    let manifest_text = serde_json::to_string(&manifest).map_err(|error| error.to_string())?;
    let manifest_hash = shell_contract::hex_sha256(manifest_text.as_bytes());
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO shell_generations(build_id, manifest_json, manifest_sha256, status, installed_at_unix_ms)
         VALUES (?1, ?2, ?3, 'candidate', ?4)
         ON CONFLICT(build_id) DO UPDATE SET manifest_json = excluded.manifest_json,
           manifest_sha256 = excluded.manifest_sha256, status = 'candidate'",
        params![manifest.build_id, manifest_text, manifest_hash, now],
    ).map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE shell_registry SET candidate_build_id = ?1 WHERE singleton = 1",
            [&manifest.build_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    let asset_count = manifest.assets.len();
    let build_id = manifest.build_id.clone();
    state.candidate = Some(CandidateShell {
        manifest,
        health_nonce: health_nonce.clone(),
    });
    Ok(PrepareResult {
        state: "candidate-staged",
        build_id,
        health_nonce: Some(health_nonce),
        assets_verified: asset_count,
        source_origin: SHELL_SOURCE_ORIGIN,
    })
}

pub(crate) fn incoming_is_current(
    state: &ShellState,
    manifest: &ShellManifest,
) -> Result<bool, String> {
    let Some(active) = state
        .active
        .as_ref()
        .filter(|active| active.build_id == manifest.build_id)
    else {
        return Ok(false);
    };
    if active != manifest {
        return Err("immutable shell build ID was reused with different manifest content".into());
    }
    Ok(true)
}

pub fn confirm_candidate(
    connection: &mut Connection,
    state: &mut ShellState,
    request: &ConfirmCandidateRequest,
) -> Result<BootstrapStatus, String> {
    let candidate = state
        .candidate
        .clone()
        .ok_or_else(|| "no staged candidate".to_string())?;
    if request.build_id != candidate.manifest.build_id
        || request.health_nonce != candidate.health_nonce
    {
        return Err("candidate health correlation failed".into());
    }
    shell_contract::validate_ready_evidence(&candidate.manifest, &request.evidence)?;
    let old_active = state.active.clone();
    let now = i64::try_from(now_unix_ms()?).map_err(|_| "timestamp overflow".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction.execute("UPDATE shell_generations SET status = 'retained' WHERE status IN ('active', 'previous')", []).map_err(|error| error.to_string())?;
    if let Some(active) = &old_active {
        transaction
            .execute(
                "UPDATE shell_generations SET status = 'previous' WHERE build_id = ?1",
                [&active.build_id],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.execute("UPDATE shell_generations SET status = 'active', promoted_at_unix_ms = ?2 WHERE build_id = ?1", params![candidate.manifest.build_id, now]).map_err(|error| error.to_string())?;
    transaction.execute(
        "UPDATE shell_registry SET previous_build_id = active_build_id, active_build_id = ?1, candidate_build_id = NULL WHERE singleton = 1",
        [&candidate.manifest.build_id],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    state.previous = old_active;
    state.active = Some(candidate.manifest);
    state.candidate = None;
    Ok(status(state))
}

pub fn asset(
    root: &Path,
    state: &ShellState,
    channel: &str,
    asset_path: &str,
) -> Result<(Vec<u8>, String), String> {
    let manifest = match channel {
        "active" => state.active.as_ref(),
        "candidate" => state
            .candidate
            .as_ref()
            .map(|candidate| &candidate.manifest),
        "previous" => state.previous.as_ref(),
        _ => None,
    }
    .ok_or_else(|| "shell generation unavailable".to_string())?;
    let asset = manifest
        .assets
        .iter()
        .find(|asset| asset.path == asset_path)
        .ok_or_else(|| "asset is not declared in the verified manifest".to_string())?;
    let path = root
        .join("shell-generations")
        .join(&manifest.build_id)
        .join(&asset.path);
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    shell_contract::verify_asset(asset, &bytes)?;
    Ok((bytes, asset.content_type.clone()))
}

pub fn validate_frontend_build(state: &ShellState, build_id: &str) -> Result<(), String> {
    let valid = state
        .active
        .as_ref()
        .is_some_and(|item| item.frontend_build_id == build_id)
        || state
            .candidate
            .as_ref()
            .is_some_and(|item| item.manifest.frontend_build_id == build_id)
        || build_id == "bundled-fallback-v2";
    if valid {
        Ok(())
    } else {
        Err("frontend build is not active, staged, or bundled fallback".into())
    }
}
