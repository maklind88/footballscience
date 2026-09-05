use crate::authority;
use crate::local_data::{LOCAL_SCHEMA_VERSION, SYNC_PROTOCOL_VERSION};
use crate::release_trust::{KeyRole, ReleaseTrustStore};
use crate::shell_contract;
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use uuid::Uuid;

fn now_unix_ms() -> Result<u64, String> {
    u64::try_from(authority::now_unix_ms()?).map_err(|_| "timestamp overflow".to_string())
}

pub const SHELL_SOURCE_ORIGIN: &str = "http://127.0.0.1:47842";
pub const NATIVE_APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const APP_READY_SCHEMA: &str = "fs-desktop-candidate-ready-v2";
pub const MANIFEST_SCHEMA: &str = "fs-desktop-shell-manifest-v2";
pub const RECOVERY_SCHEMA: &str = "fs-desktop-signed-recovery-v1";
pub const CANDIDATE_TIMEOUT_MS: u64 = 8_000;
pub const NATIVE_SHELL_CACHE_VERSION: &str = "fs-desktop-native-shell-cache-v2";
pub const ACTIVE_CAPABILITIES: [&str; 8] = [
    "bootstrap.status",
    "bootstrap.update",
    "runtime.info",
    "session.authority",
    "session.operation",
    "session.read",
    "session.sync-status",
    "spike.probe",
];
pub const CANDIDATE_CAPABILITIES: [&str; 3] =
    ["candidate.confirm", "candidate.failure", "candidate.status"];

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
pub struct SignedRecoveryAuthorization {
    pub schema: String,
    pub target_release_sequence: u64,
    pub authorized_from_sequence: u64,
    pub expires_at_unix_ms: u64,
    pub reason_code: String,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShellManifest {
    pub schema: String,
    pub release_id: String,
    pub build_id: String,
    pub frontend_build_id: String,
    pub release_sequence: u64,
    pub issued_at_unix_ms: u64,
    pub native_version_requirement: String,
    pub local_schema_version: u32,
    pub sync_protocol_version: u32,
    pub required_capabilities: Vec<String>,
    pub entrypoint: String,
    pub app_ready_schema: String,
    pub signing_key_id: String,
    pub recovery_authorization: Option<SignedRecoveryAuthorization>,
    pub assets: Vec<ShellAsset>,
}

#[derive(Clone)]
pub struct CandidateShell {
    pub manifest: ShellManifest,
    pub health_nonce: Option<String>,
    pub attempt_started_at_unix_ms: Option<u64>,
    pub deadline_unix_ms: Option<u64>,
    pub failure_count: u32,
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
    pub active_release_sequence: Option<u64>,
    pub previous_build_id: Option<String>,
    pub candidate_build_id: Option<String>,
    pub active_capabilities: Vec<&'static str>,
    pub fallback_available: bool,
    pub shell_cache_version: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareResult {
    pub state: &'static str,
    pub build_id: String,
    pub release_sequence: u64,
    pub assets_verified: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateRuntimeStatus {
    pub schema: &'static str,
    pub candidate_build_id: String,
    pub frontend_build_id: String,
    pub release_sequence: u64,
    pub health_nonce: String,
    pub deadline_unix_ms: u64,
    pub native_app_version: &'static str,
    pub local_schema_version: u32,
    pub sync_protocol_version: u32,
    pub candidate_capabilities: Vec<&'static str>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CandidateNegativeChecks {
    pub session_authority_denied: bool,
    pub session_read_denied: bool,
    pub session_operation_denied: bool,
    pub session_sync_status_denied: bool,
    pub outbox_denied: bool,
    pub active_confirmation_denied: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfirmCandidateRequest {
    pub schema: String,
    pub health_nonce: String,
    pub shell_fully_initialized: bool,
    pub negative_checks: CandidateNegativeChecks,
}

pub fn migrate(connection: &Connection) -> Result<(), String> {
    if table_exists(connection, "shell_generations")?
        && !column_exists(connection, "shell_generations", "release_sequence")?
    {
        connection
            .execute_batch(
                "DROP TABLE IF EXISTS shell_registry;
                 DROP TABLE IF EXISTS shell_security_state;
                 DROP TABLE IF EXISTS shell_generations;",
            )
            .map_err(|error| error.to_string())?;
    }
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS shell_generations (
               build_id TEXT PRIMARY KEY,
               release_id TEXT NOT NULL UNIQUE,
               release_sequence INTEGER NOT NULL,
               manifest_json TEXT NOT NULL,
               signed_manifest_sha256 TEXT NOT NULL,
               signature_json TEXT NOT NULL,
               signing_key_id TEXT NOT NULL,
               status TEXT NOT NULL CHECK (status IN ('candidate', 'active', 'previous', 'retained', 'quarantined')),
               installed_at_unix_ms INTEGER NOT NULL,
               promoted_at_unix_ms INTEGER,
               attempt_started_at_unix_ms INTEGER,
               candidate_deadline_unix_ms INTEGER,
               failure_count INTEGER NOT NULL DEFAULT 0,
               failure_code TEXT,
               quarantined_at_unix_ms INTEGER,
               retry_after_unix_ms INTEGER,
               isolation_proof_schema TEXT
             ) STRICT;
             CREATE UNIQUE INDEX IF NOT EXISTS shell_generations_release_sequence_idx
               ON shell_generations(release_sequence);
             CREATE TABLE IF NOT EXISTS shell_registry (
               singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
               active_build_id TEXT REFERENCES shell_generations(build_id),
               previous_build_id TEXT REFERENCES shell_generations(build_id),
               candidate_build_id TEXT REFERENCES shell_generations(build_id)
             ) STRICT;
             CREATE TABLE IF NOT EXISTS shell_security_state (
               singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
               highest_seen_release_sequence INTEGER NOT NULL DEFAULT 0,
               highest_seen_build_id TEXT,
               updated_at_unix_ms INTEGER NOT NULL DEFAULT 0
             ) STRICT;
             INSERT OR IGNORE INTO shell_registry(singleton) VALUES (1);
             INSERT OR IGNORE INTO shell_security_state(singleton) VALUES (1);",
        )
        .map_err(|error| error.to_string())?;
    if !column_exists(connection, "shell_generations", "isolation_proof_schema")? {
        connection
            .execute_batch("ALTER TABLE shell_generations ADD COLUMN isolation_proof_schema TEXT;")
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn table_exists(connection: &Connection, name: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [name],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        if row.get::<_, String>(1).map_err(|error| error.to_string())? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn recover_interrupted_candidate(connection: &Connection) -> Result<(), String> {
    let now = i64::try_from(now_unix_ms()?).map_err(|_| "timestamp overflow".to_string())?;
    let candidate: Option<(String, Option<i64>)> = connection
        .query_row(
            "SELECT g.build_id, g.attempt_started_at_unix_ms
             FROM shell_registry r JOIN shell_generations g ON g.build_id = r.candidate_build_id
             WHERE r.singleton = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some((build_id, Some(_))) = candidate {
        let failure_count: i64 = connection
            .query_row(
                "SELECT failure_count + 1 FROM shell_generations WHERE build_id = ?1",
                [&build_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let retry_after = now + backoff_ms(failure_count as u32) as i64;
        connection
            .execute(
                "UPDATE shell_generations SET status = 'quarantined', failure_count = ?2,
                   failure_code = 'interrupted', quarantined_at_unix_ms = ?3,
                   retry_after_unix_ms = ?4, attempt_started_at_unix_ms = NULL,
                   candidate_deadline_unix_ms = NULL WHERE build_id = ?1",
                params![build_id, failure_count, now, retry_after],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "UPDATE shell_registry SET candidate_build_id = NULL WHERE singleton = 1",
                [],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn verify_persisted_registry(
    root: &Path,
    connection: &Connection,
    trust_store: &ReleaseTrustStore,
) -> Result<(), String> {
    let (active, previous, candidate) = connection
        .query_row(
            "SELECT active_build_id, previous_build_id, candidate_build_id
             FROM shell_registry WHERE singleton = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|error| error.to_string())?;
    let active_valid = active
        .as_deref()
        .is_some_and(|id| verify_persisted_generation(root, connection, trust_store, id).is_ok());
    let previous_valid = previous
        .as_deref()
        .is_some_and(|id| verify_persisted_generation(root, connection, trust_store, id).is_ok());
    let candidate_valid = candidate
        .as_deref()
        .is_none_or(|id| verify_persisted_generation(root, connection, trust_store, id).is_ok());

    if !candidate_valid {
        if let Some(candidate_id) = &candidate {
            connection
                .execute(
                    "UPDATE shell_generations SET status = 'quarantined',
                       failure_count = failure_count + 1, failure_code = 'integrity-failed',
                       quarantined_at_unix_ms = ?2, retry_after_unix_ms = ?3
                     WHERE build_id = ?1",
                    params![
                        candidate_id,
                        now_unix_ms()? as i64,
                        now_unix_ms()?.saturating_add(86_400_000) as i64,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        connection
            .execute(
                "UPDATE shell_registry SET candidate_build_id = NULL WHERE singleton = 1",
                [],
            )
            .map_err(|error| error.to_string())?;
    }
    if !active_valid {
        if previous_valid {
            let previous_id = previous
                .as_ref()
                .ok_or_else(|| "previous generation recovery state is inconsistent".to_string())?;
            connection
                .execute(
                    "UPDATE shell_generations SET status = 'retained' WHERE status = 'active'",
                    [],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "UPDATE shell_generations SET status = 'active' WHERE build_id = ?1",
                    [previous_id],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "UPDATE shell_registry SET active_build_id = ?1, previous_build_id = NULL
                     WHERE singleton = 1",
                    [previous_id],
                )
                .map_err(|error| error.to_string())?;
        } else {
            connection
                .execute(
                    "UPDATE shell_registry SET active_build_id = NULL, previous_build_id = NULL
                     WHERE singleton = 1",
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
    } else if previous.is_some() && !previous_valid {
        connection
            .execute(
                "UPDATE shell_registry SET previous_build_id = NULL WHERE singleton = 1",
                [],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn verify_persisted_generation(
    root: &Path,
    connection: &Connection,
    trust_store: &ReleaseTrustStore,
    build_id: &str,
) -> Result<ShellManifest, String> {
    let generation_root = root.join("shell-generations").join(build_id);
    let manifest_bytes = fs::read(generation_root.join("manifest.json"))
        .map_err(|_| "persisted signed manifest is unavailable".to_string())?;
    let signature_bytes = fs::read(generation_root.join("manifest.sig"))
        .map_err(|_| "persisted detached signature is unavailable".to_string())?;
    let verified = trust_store.verify_exact_manifest_bytes(&manifest_bytes, &signature_bytes)?;
    let manifest: ShellManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| "persisted signed manifest is malformed".to_string())?;
    if manifest.build_id != build_id || manifest.signing_key_id != verified.signing_key_id {
        return Err("persisted shell identity does not match its trusted registry".into());
    }
    shell_contract::validate_manifest(&manifest, now_unix_ms()?)?;
    let stored: (String, String, i64, String) = connection
        .query_row(
            "SELECT signed_manifest_sha256, signing_key_id, release_sequence, manifest_json
             FROM shell_generations WHERE build_id = ?1",
            [build_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|error| error.to_string())?;
    if stored.0 != shell_contract::hex_sha256(&manifest_bytes)
        || stored.1 != manifest.signing_key_id
        || stored.2 != manifest.release_sequence as i64
        || stored.3.as_bytes() != manifest_bytes
    {
        return Err("persisted shell registry binding failed".into());
    }
    shell_contract::verify_generation(&generation_root, &manifest)?;
    Ok(manifest)
}

pub fn load_state(connection: &Connection) -> Result<ShellState, String> {
    let identifiers = connection
        .query_row(
            "SELECT active_build_id, previous_build_id, candidate_build_id FROM shell_registry WHERE singleton = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|error| error.to_string())?;
    let candidate = load_candidate(connection, identifiers.2.as_deref())?;
    Ok(ShellState {
        active: load_manifest(connection, identifiers.0.as_deref())?,
        previous: load_manifest(connection, identifiers.1.as_deref())?,
        candidate,
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

fn load_candidate(
    connection: &Connection,
    build_id: Option<&str>,
) -> Result<Option<CandidateShell>, String> {
    let Some(build_id) = build_id else {
        return Ok(None);
    };
    connection
        .query_row(
            "SELECT manifest_json, failure_count, attempt_started_at_unix_ms, candidate_deadline_unix_ms
             FROM shell_generations WHERE build_id = ?1 AND status = 'candidate'",
            [build_id],
            |row| {
                let manifest_json: String = row.get(0)?;
                let manifest = serde_json::from_str(&manifest_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        manifest_json.len(),
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(CandidateShell {
                    manifest,
                    health_nonce: None,
                    failure_count: row.get::<_, i64>(1)? as u32,
                    attempt_started_at_unix_ms: row.get::<_, Option<i64>>(2)?.map(|v| v as u64),
                    deadline_unix_ms: row.get::<_, Option<i64>>(3)?.map(|v| v as u64),
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

pub fn status(state: &ShellState) -> BootstrapStatus {
    BootstrapStatus {
        schema: "fs-desktop-bootstrap-status-v2",
        native_app_version: NATIVE_APP_VERSION,
        local_schema_version: LOCAL_SCHEMA_VERSION,
        sync_protocol_version: SYNC_PROTOCOL_VERSION,
        active_build_id: state.active.as_ref().map(|item| item.build_id.clone()),
        active_release_sequence: state.active.as_ref().map(|item| item.release_sequence),
        previous_build_id: state.previous.as_ref().map(|item| item.build_id.clone()),
        candidate_build_id: state
            .candidate
            .as_ref()
            .map(|item| item.manifest.build_id.clone()),
        active_capabilities: ACTIVE_CAPABILITIES.to_vec(),
        fallback_available: true,
        shell_cache_version: NATIVE_SHELL_CACHE_VERSION,
    }
}

pub fn download_and_stage(
    root: &Path,
    connection: &mut Connection,
    state: &mut ShellState,
    trust_store: &ReleaseTrustStore,
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
    let signature_bytes = shell_contract::bounded_get(
        &client,
        &format!("{SHELL_SOURCE_ORIGIN}/manifest.sig"),
        2_048,
    )?;
    let verified = trust_store.verify_exact_manifest_bytes(&manifest_bytes, &signature_bytes)?;
    let manifest: ShellManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("invalid signed shell manifest: {error}"))?;
    let now = now_unix_ms()?;
    if manifest.signing_key_id != verified.signing_key_id {
        return Err("signed manifest key ID does not match detached signature".into());
    }
    shell_contract::validate_manifest(&manifest, now)?;
    let manifest_hash = shell_contract::hex_sha256(&manifest_bytes);
    if let Some(result) = existing_release_result(
        connection,
        state,
        &manifest,
        &manifest_hash,
        verified.key_role,
        now,
    )? {
        return Ok(result);
    }
    enforce_remote_sequence(connection, &manifest, verified.key_role, now)?;

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
        let bytes = shell_contract::bounded_get_asset(&client, &url, asset)?;
        shell_contract::verify_asset(asset, &bytes)?;
        shell_contract::durable_write(&pending_path.join(&asset.path), &bytes)?;
    }
    shell_contract::durable_write(&pending_path.join("manifest.json"), &manifest_bytes)?;
    shell_contract::durable_write(&pending_path.join("manifest.sig"), &signature_bytes)?;
    if final_path.exists() {
        shell_contract::verify_generation(&final_path, &manifest)?;
        fs::remove_dir_all(&pending_path).map_err(|error| error.to_string())?;
    } else {
        fs::rename(&pending_path, &final_path).map_err(|error| error.to_string())?;
    }
    shell_contract::verify_generation(&final_path, &manifest)?;

    let now_i64 = i64::try_from(now).map_err(|_| "timestamp overflow".to_string())?;
    let manifest_text = std::str::from_utf8(&manifest_bytes)
        .map_err(|_| "signed manifest is not UTF-8".to_string())?;
    let signature_text = std::str::from_utf8(&signature_bytes)
        .map_err(|_| "detached signature is not UTF-8".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO shell_generations(
               build_id, release_id, release_sequence, manifest_json, signed_manifest_sha256,
               signature_json, signing_key_id, status, installed_at_unix_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'candidate', ?8)",
            params![
                manifest.build_id,
                manifest.release_id,
                manifest.release_sequence as i64,
                manifest_text,
                manifest_hash,
                signature_text,
                manifest.signing_key_id,
                now_i64,
            ],
        )
        .map_err(|error| {
            format!("immutable frontend release registry rejected candidate: {error}")
        })?;
    transaction
        .execute(
            "UPDATE shell_registry SET candidate_build_id = ?1 WHERE singleton = 1",
            [&manifest.build_id],
        )
        .map_err(|error| error.to_string())?;
    if manifest.release_sequence > highest_seen_sequence(&transaction)? {
        transaction
            .execute(
                "UPDATE shell_security_state SET highest_seen_release_sequence = ?1,
                   highest_seen_build_id = ?2, updated_at_unix_ms = ?3 WHERE singleton = 1",
                params![manifest.release_sequence as i64, manifest.build_id, now_i64],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    let result = PrepareResult {
        state: "candidate-staged",
        build_id: manifest.build_id.clone(),
        release_sequence: manifest.release_sequence,
        assets_verified: manifest.assets.len(),
    };
    state.candidate = Some(CandidateShell {
        manifest,
        health_nonce: None,
        attempt_started_at_unix_ms: None,
        deadline_unix_ms: None,
        failure_count: 0,
    });
    Ok(result)
}

fn existing_release_result(
    connection: &mut Connection,
    state: &mut ShellState,
    manifest: &ShellManifest,
    manifest_hash: &str,
    key_role: KeyRole,
    now: u64,
) -> Result<Option<PrepareResult>, String> {
    let existing: Option<(String, String, i64, Option<i64>)> = connection
        .query_row(
            "SELECT signed_manifest_sha256, status, failure_count, retry_after_unix_ms
             FROM shell_generations WHERE build_id = ?1",
            [&manifest.build_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((known_hash, status, failure_count, retry_after)) = existing else {
        return Ok(None);
    };
    if known_hash != manifest_hash {
        return Err("immutable frontend build ID was reused with different signed content".into());
    }
    let result_state = match status.as_str() {
        "active" => "up-to-date",
        "candidate" => "candidate-pending",
        "quarantined" if retry_after.is_some_and(|value| value > now as i64) => {
            "candidate-quarantined"
        }
        "quarantined" => {
            // A known immutable release is not exempt from rollback/recovery policy on retry.
            let highest = highest_seen_sequence(connection)?;
            if manifest.release_sequence != highest
                || key_role != KeyRole::Release
                || manifest.recovery_authorization.is_some()
            {
                enforce_remote_sequence(connection, manifest, key_role, now)?;
            }
            connection
                .execute(
                    "UPDATE shell_generations SET status = 'candidate', failure_code = NULL,
                       quarantined_at_unix_ms = NULL, retry_after_unix_ms = NULL
                     WHERE build_id = ?1",
                    [&manifest.build_id],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "UPDATE shell_registry SET candidate_build_id = ?1 WHERE singleton = 1",
                    [&manifest.build_id],
                )
                .map_err(|error| error.to_string())?;
            state.candidate = Some(CandidateShell {
                manifest: manifest.clone(),
                health_nonce: None,
                attempt_started_at_unix_ms: None,
                deadline_unix_ms: None,
                failure_count: failure_count as u32,
            });
            "candidate-staged"
        }
        _ => "retained-release-not-reactivated",
    };
    Ok(Some(PrepareResult {
        state: result_state,
        build_id: manifest.build_id.clone(),
        release_sequence: manifest.release_sequence,
        assets_verified: manifest.assets.len(),
    }))
}

fn enforce_remote_sequence(
    connection: &Connection,
    manifest: &ShellManifest,
    key_role: KeyRole,
    now: u64,
) -> Result<(), String> {
    let highest = highest_seen_sequence(connection)?;
    if manifest.release_sequence > highest {
        if key_role != KeyRole::Release || manifest.recovery_authorization.is_some() {
            return Err("ordinary frontend release must use a pinned release key".into());
        }
        return Ok(());
    }
    if manifest.release_sequence == highest {
        return Err("frontend release sequence was reused by a different build".into());
    }
    let authorization = manifest
        .recovery_authorization
        .as_ref()
        .ok_or_else(|| "remote frontend rollback attempt rejected".to_string())?;
    if key_role != KeyRole::Recovery
        || authorization.schema != RECOVERY_SCHEMA
        || authorization.target_release_sequence != manifest.release_sequence
        || authorization.authorized_from_sequence < highest
        || authorization.expires_at_unix_ms < now
        || authorization.reason_code.len() < 4
        || authorization.reason_code.len() > 80
    {
        return Err("remote recovery authorization is invalid".into());
    }
    Ok(())
}

fn highest_seen_sequence(connection: &Connection) -> Result<u64, String> {
    connection
        .query_row(
            "SELECT highest_seen_release_sequence FROM shell_security_state WHERE singleton = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value as u64)
        .map_err(|error| error.to_string())
}

pub fn begin_candidate_attempt(
    connection: &Connection,
    state: &mut ShellState,
    timeout_ms: u64,
) -> Result<CandidateRuntimeStatus, String> {
    let candidate = state
        .candidate
        .as_mut()
        .ok_or_else(|| "no staged signed candidate".to_string())?;
    if candidate.health_nonce.is_some() {
        return candidate_status(state);
    }
    let started = now_unix_ms()?;
    let deadline = started
        .checked_add(timeout_ms)
        .ok_or_else(|| "candidate deadline overflow".to_string())?;
    let nonce = Uuid::new_v4().to_string();
    connection
        .execute(
            "UPDATE shell_generations SET attempt_started_at_unix_ms = ?2,
               candidate_deadline_unix_ms = ?3 WHERE build_id = ?1 AND status = 'candidate'",
            params![candidate.manifest.build_id, started as i64, deadline as i64],
        )
        .map_err(|error| error.to_string())?;
    candidate.health_nonce = Some(nonce);
    candidate.attempt_started_at_unix_ms = Some(started);
    candidate.deadline_unix_ms = Some(deadline);
    candidate_status(state)
}

pub fn candidate_status(state: &ShellState) -> Result<CandidateRuntimeStatus, String> {
    let candidate = state
        .candidate
        .as_ref()
        .ok_or_else(|| "no staged signed candidate".to_string())?;
    Ok(CandidateRuntimeStatus {
        schema: "fs-desktop-candidate-status-v2",
        candidate_build_id: candidate.manifest.build_id.clone(),
        frontend_build_id: candidate.manifest.frontend_build_id.clone(),
        release_sequence: candidate.manifest.release_sequence,
        health_nonce: candidate
            .health_nonce
            .clone()
            .ok_or_else(|| "candidate health attempt has not started".to_string())?,
        deadline_unix_ms: candidate
            .deadline_unix_ms
            .ok_or_else(|| "candidate deadline is unavailable".to_string())?,
        native_app_version: NATIVE_APP_VERSION,
        local_schema_version: LOCAL_SCHEMA_VERSION,
        sync_protocol_version: SYNC_PROTOCOL_VERSION,
        candidate_capabilities: CANDIDATE_CAPABILITIES.to_vec(),
    })
}

pub fn confirm_candidate(
    connection: &mut Connection,
    state: &mut ShellState,
    request: &ConfirmCandidateRequest,
) -> Result<BootstrapStatus, String> {
    let candidate = state
        .candidate
        .clone()
        .ok_or_else(|| "no staged signed candidate".to_string())?;
    let now = now_unix_ms()?;
    if request.schema != APP_READY_SCHEMA
        || !request.shell_fully_initialized
        || candidate.health_nonce.as_deref() != Some(request.health_nonce.as_str())
        || candidate
            .deadline_unix_ms
            .is_none_or(|deadline| now > deadline)
    {
        return Err("candidate health correlation failed".into());
    }
    let checks = &request.negative_checks;
    if !checks.session_authority_denied
        || !checks.session_read_denied
        || !checks.session_operation_denied
        || !checks.session_sync_status_denied
        || !checks.outbox_denied
        || !checks.active_confirmation_denied
    {
        return Err("candidate privilege-isolation proof is incomplete".into());
    }
    let old_active = state.active.clone();
    let now_i64 = i64::try_from(now).map_err(|_| "timestamp overflow".to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE shell_generations SET status = 'retained' WHERE status IN ('active', 'previous')",
            [],
        )
        .map_err(|error| error.to_string())?;
    if let Some(active) = &old_active {
        transaction
            .execute(
                "UPDATE shell_generations SET status = 'previous' WHERE build_id = ?1",
                [&active.build_id],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "UPDATE shell_generations SET status = 'active', promoted_at_unix_ms = ?2,
               attempt_started_at_unix_ms = NULL, candidate_deadline_unix_ms = NULL,
               failure_code = NULL,
               isolation_proof_schema = 'fs-desktop-candidate-isolation-v1'
             WHERE build_id = ?1",
            params![candidate.manifest.build_id, now_i64],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE shell_registry SET previous_build_id = active_build_id,
               active_build_id = ?1, candidate_build_id = NULL WHERE singleton = 1",
            [&candidate.manifest.build_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    state.previous = old_active;
    state.active = Some(candidate.manifest);
    state.candidate = None;
    Ok(status(state))
}

pub fn quarantine_candidate(
    connection: &Connection,
    state: &mut ShellState,
    expected_nonce: &str,
    failure_code: &str,
) -> Result<bool, String> {
    if !matches!(
        failure_code,
        "timeout" | "initialization-failed" | "window-closed" | "interrupted"
    ) {
        return Err("unsupported sanitized candidate failure code".into());
    }
    let Some(candidate) = state.candidate.as_ref() else {
        return Ok(false);
    };
    if candidate.health_nonce.as_deref() != Some(expected_nonce) {
        return Ok(false);
    }
    let now = now_unix_ms()?;
    let failure_count = candidate.failure_count.saturating_add(1);
    let retry_after = now.saturating_add(backoff_ms(failure_count));
    connection
        .execute(
            "UPDATE shell_generations SET status = 'quarantined', failure_count = ?2,
               failure_code = ?3, quarantined_at_unix_ms = ?4, retry_after_unix_ms = ?5,
               attempt_started_at_unix_ms = NULL, candidate_deadline_unix_ms = NULL
             WHERE build_id = ?1 AND status = 'candidate'",
            params![
                candidate.manifest.build_id,
                failure_count as i64,
                failure_code,
                now as i64,
                retry_after as i64,
            ],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE shell_registry SET candidate_build_id = NULL WHERE singleton = 1",
            [],
        )
        .map_err(|error| error.to_string())?;
    state.candidate = None;
    Ok(true)
}

fn backoff_ms(failure_count: u32) -> u64 {
    let exponent = failure_count.saturating_sub(1).min(10);
    (60_000_u64.saturating_mul(1_u64 << exponent)).min(86_400_000)
}

pub fn asset(
    root: &Path,
    state: &ShellState,
    channel: &str,
    asset_path: &str,
) -> Result<(Vec<u8>, String), String> {
    let manifest = match channel {
        "active" => state.active.as_ref(),
        "candidate" => state.candidate.as_ref().map(|item| &item.manifest),
        "previous" => state.previous.as_ref(),
        _ => None,
    }
    .ok_or_else(|| "shell generation unavailable".to_string())?;
    let asset = manifest
        .assets
        .iter()
        .find(|asset| asset.path == asset_path)
        .ok_or_else(|| "asset is not declared in the signed manifest".to_string())?;
    let path = root
        .join("shell-generations")
        .join(&manifest.build_id)
        .join(&asset.path);
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    shell_contract::verify_asset(asset, &bytes)?;
    Ok((bytes, asset.content_type.clone()))
}

pub fn validate_active_frontend_build(state: &ShellState, build_id: &str) -> Result<(), String> {
    if state
        .active
        .as_ref()
        .is_some_and(|item| item.frontend_build_id == build_id)
    {
        Ok(())
    } else {
        Err("frontend build is not the native active generation".into())
    }
}

#[cfg(test)]
pub(crate) fn enforce_sequence_for_test(
    connection: &Connection,
    manifest: &ShellManifest,
    role: KeyRole,
    now: u64,
) -> Result<(), String> {
    enforce_remote_sequence(connection, manifest, role, now)
}

#[cfg(test)]
pub(crate) fn existing_release_result_for_test(
    connection: &mut Connection,
    state: &mut ShellState,
    manifest: &ShellManifest,
    manifest_hash: &str,
    now: u64,
) -> Result<Option<PrepareResult>, String> {
    existing_release_result(
        connection,
        state,
        manifest,
        manifest_hash,
        KeyRole::Release,
        now,
    )
}
