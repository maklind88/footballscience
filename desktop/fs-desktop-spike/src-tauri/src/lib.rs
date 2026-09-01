mod authority;
mod bootstrap;
#[cfg(test)]
mod bootstrap_tests;
mod ci_trace;
mod local_data;
mod local_schema;
mod protocol;
mod release_trust;
mod runtime;
mod shell_contract;
#[cfg(test)]
mod sync_contract;
mod windows;

use authority::{SessionAuthoritySnapshot, SessionContextProof};
use bootstrap::{BootstrapStatus, CandidateRuntimeStatus, ConfirmCandidateRequest, PrepareResult};
use local_data::{OperationReceipt, SessionOperationRequest, SessionSlice, SessionSyncStatus};
use runtime::{DeliveryMode, DesktopRuntime, DesktopState, delivery_mode};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, WebviewWindow};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    native_app_version: String,
    runtime: &'static str,
    delivery_mode: &'static str,
    local_schema_version: u32,
    sync_protocol_version: u32,
    capabilities: Vec<&'static str>,
    global_tauri_enabled: bool,
    content_origin: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryStatus {
    schema: &'static str,
    read_only: bool,
    offline_access_available: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CandidateFailureRequest {
    health_nonce: String,
    failure_code: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SpikeProbe {
    candidate: String,
    boot_mode: String,
    shell_version: String,
    cache_version: String,
    payload_build_id: String,
    cached_payload: bool,
    service_worker_controlled: bool,
    unauthorized_command_rejected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredProbe<'a> {
    recorded_at_unix_ms: u128,
    probe: &'a SpikeProbe,
    native_evidence: NativeProbeEvidence,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeProbeEvidence {
    active_build_id: Option<String>,
    previous_build_id: Option<String>,
    candidate_build_id: Option<String>,
    active_isolation_proof_schema: Option<String>,
    latest_quarantine: Option<QuarantineEvidence>,
    local_projection_loaded: bool,
    selected_session_revision: Option<i64>,
    partition_validated: bool,
    synthetic_identity: bool,
    local_schema_version: u32,
    sync_protocol_version: u32,
    custom_protocol: bool,
    content_origin: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QuarantineEvidence {
    build_id: String,
    failure_count: i64,
    failure_code: String,
    retry_after_unix_ms: Option<i64>,
}

fn runtime(
    state: &tauri::State<'_, DesktopState>,
) -> Result<std::sync::Arc<DesktopRuntime>, String> {
    state.runtime()
}

fn require_window(window: &WebviewWindow, role: windows::WebviewRole) -> Result<(), String> {
    let expected_label = match role {
        windows::WebviewRole::Active
        | windows::WebviewRole::Bundled
        | windows::WebviewRole::UnauthorizedProbe => "main",
        windows::WebviewRole::Candidate => "candidate",
        windows::WebviewRole::Recovery => "recovery",
    };
    let url = window.url().map_err(|error| error.to_string())?;
    if window.label() != expected_label || !windows::navigation_allowed(role, &url) {
        return Err("desktop command caller is outside its native window/origin role".into());
    }
    Ok(())
}

fn require_active_window(window: &WebviewWindow) -> Result<(), String> {
    match delivery_mode() {
        DeliveryMode::Hosted => require_window(window, windows::WebviewRole::Active),
        DeliveryMode::Bundled => require_window(window, windows::WebviewRole::Bundled),
        DeliveryMode::UnauthorizedOrigin => {
            Err("negative-probe origin has no active privileges".into())
        }
    }
}

#[tauri::command]
fn desktop_runtime_info(
    app: tauri::AppHandle,
    window: WebviewWindow,
) -> Result<RuntimeInfo, String> {
    require_active_window(&window)?;
    Ok(RuntimeInfo {
        native_app_version: app.package_info().version.to_string(),
        runtime: "tauri",
        delivery_mode: match delivery_mode() {
            DeliveryMode::Bundled => "bundled",
            DeliveryMode::Hosted => "signed-frontend-delivery",
            DeliveryMode::UnauthorizedOrigin => "unauthorized-origin-probe",
        },
        local_schema_version: local_data::LOCAL_SCHEMA_VERSION,
        sync_protocol_version: local_data::SYNC_PROTOCOL_VERSION,
        capabilities: bootstrap::ACTIVE_CAPABILITIES.to_vec(),
        global_tauri_enabled: false,
        content_origin: "fs-active://localhost (http://fs-active.localhost on Windows)",
    })
}

#[tauri::command]
fn desktop_bootstrap_status(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<BootstrapStatus, String> {
    ci_trace::record("command desktop_bootstrap_status");
    require_window(&window, windows::WebviewRole::Active)?;
    let runtime = runtime(&state)?;
    let shell = runtime
        .shell
        .read()
        .map_err(|_| "shell state lock poisoned".to_string())?;
    Ok(bootstrap::status(&shell))
}

#[tauri::command]
async fn desktop_prepare_shell_update(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<PrepareResult, String> {
    ci_trace::record("command desktop_prepare_shell_update");
    require_window(&window, windows::WebviewRole::Active)?;
    let runtime = runtime(&state)?;
    let worker_runtime = runtime.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut shell = worker_runtime
            .shell
            .write()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        let mut connection = worker_runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        bootstrap::download_and_stage(
            &worker_runtime.root,
            &mut connection,
            &mut shell,
            worker_runtime.release_trust()?,
        )
    })
    .await;
    let result = match result {
        Ok(Ok(result)) => {
            ci_trace::record(format!(
                "command desktop_prepare_shell_update completed state={}",
                result.state
            ));
            result
        }
        Ok(Err(error)) => {
            ci_trace::record(format!(
                "command desktop_prepare_shell_update failed error={error}"
            ));
            return Err(error);
        }
        Err(error) => {
            ci_trace::record("command desktop_prepare_shell_update task failed");
            return Err(error.to_string());
        }
    };
    if matches!(result.state, "candidate-staged" | "candidate-pending")
        && app.get_webview_window("candidate").is_none()
    {
        windows::start_candidate(&app, runtime)?;
    }
    Ok(result)
}

#[tauri::command]
fn desktop_candidate_status(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<CandidateRuntimeStatus, String> {
    ci_trace::record("command desktop_candidate_status");
    require_window(&window, windows::WebviewRole::Candidate)?;
    let runtime = runtime(&state)?;
    let shell = runtime
        .shell
        .read()
        .map_err(|_| "shell state lock poisoned".to_string())?;
    bootstrap::candidate_status(&shell)
}

#[tauri::command]
fn desktop_candidate_confirm(
    window: WebviewWindow,
    request: ConfirmCandidateRequest,
    state: tauri::State<'_, DesktopState>,
) -> Result<BootstrapStatus, String> {
    require_window(&window, windows::WebviewRole::Candidate)?;
    let runtime = runtime(&state)?;
    let result = {
        let mut shell = runtime
            .shell
            .write()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        let mut connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        bootstrap::confirm_candidate(&mut connection, &mut shell, &request)?
    };
    window.close().map_err(|error| error.to_string())?;
    Ok(result)
}

#[tauri::command]
fn desktop_candidate_report_failure(
    window: WebviewWindow,
    request: CandidateFailureRequest,
    state: tauri::State<'_, DesktopState>,
) -> Result<bool, String> {
    require_window(&window, windows::WebviewRole::Candidate)?;
    let runtime = runtime(&state)?;
    let result = {
        let mut shell = runtime
            .shell
            .write()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        let connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        bootstrap::quarantine_candidate(
            &connection,
            &mut shell,
            &request.health_nonce,
            &request.failure_code,
        )?
    };
    window.close().map_err(|error| error.to_string())?;
    Ok(result)
}

#[tauri::command]
fn desktop_open_recovery(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_window(&window, windows::WebviewRole::Active)?;
    windows::open_recovery(&app)
}

#[tauri::command]
fn desktop_recovery_status(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<RecoveryStatus, String> {
    require_window(&window, windows::WebviewRole::Recovery)?;
    let runtime = runtime(&state)?;
    let authority = runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?;
    Ok(RecoveryStatus {
        schema: "fs-desktop-recovery-status-v1",
        read_only: true,
        offline_access_available: authority.snapshot().can_read_offline,
    })
}

#[tauri::command]
fn desktop_recovery_read_selected_session(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<SessionSlice, String> {
    require_window(&window, windows::WebviewRole::Recovery)?;
    let runtime = runtime(&state)?;
    let partition = {
        let authority = runtime
            .authority
            .lock()
            .map_err(|_| "session authority lock poisoned".to_string())?;
        let snapshot = authority.snapshot();
        if !snapshot.can_read_offline {
            return Err("recovery partition is locked".into());
        }
        snapshot.partition_key
    };
    let connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    local_data::read_selected_session(&connection, &partition)
}

#[tauri::command]
fn desktop_session_authority(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<SessionAuthoritySnapshot, String> {
    require_active_window(&window)?;
    let runtime = runtime(&state)?;
    let authority = runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?;
    Ok(authority.snapshot())
}

#[tauri::command]
fn desktop_read_selected_session(
    window: WebviewWindow,
    context: SessionContextProof,
    state: tauri::State<'_, DesktopState>,
) -> Result<SessionSlice, String> {
    require_active_window(&window)?;
    let runtime = runtime(&state)?;
    runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?
        .validate(&context)?;
    {
        let shell = runtime
            .shell
            .read()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        bootstrap::validate_active_frontend_build(&shell, &context.frontend_build_id)?;
    }
    let connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    local_data::read_selected_session(&connection, &context.partition_key)
}

#[tauri::command]
fn desktop_session_sync_status(
    window: WebviewWindow,
    context: SessionContextProof,
    state: tauri::State<'_, DesktopState>,
) -> Result<SessionSyncStatus, String> {
    require_active_window(&window)?;
    let runtime = runtime(&state)?;
    runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?
        .validate(&context)?;
    {
        let shell = runtime
            .shell
            .read()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        bootstrap::validate_active_frontend_build(&shell, &context.frontend_build_id)?;
    }
    let connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    local_data::read_session_sync_status(&connection, &context.partition_key)
}

#[tauri::command]
fn desktop_apply_session_operation(
    window: WebviewWindow,
    request: SessionOperationRequest,
    state: tauri::State<'_, DesktopState>,
) -> Result<OperationReceipt, String> {
    require_active_window(&window)?;
    let runtime = runtime(&state)?;
    runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?
        .validate(&request.context)?;
    {
        let shell = runtime
            .shell
            .read()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        bootstrap::validate_active_frontend_build(&shell, &request.context.frontend_build_id)?;
    }
    let mut connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    local_data::apply_operation(&mut connection, &request, authority::now_unix_ms()?)
}

#[tauri::command]
fn record_spike_probe(
    window: WebviewWindow,
    probe: SpikeProbe,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    ci_trace::record("command record_spike_probe");
    match probe.candidate.as_str() {
        "hosted" => require_window(&window, windows::WebviewRole::Active)?,
        "bundled" => require_window(&window, windows::WebviewRole::Bundled)?,
        _ => return Err("unknown spike candidate".into()),
    }
    validate_probe(&probe)?;
    let runtime = runtime(&state)?;
    let (active_build_id, previous_build_id, candidate_build_id) = {
        let shell = runtime
            .shell
            .read()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        (
            shell.active.as_ref().map(|item| item.build_id.clone()),
            shell.previous.as_ref().map(|item| item.build_id.clone()),
            shell
                .candidate
                .as_ref()
                .map(|item| item.manifest.build_id.clone()),
        )
    };
    let authority = runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?
        .snapshot();
    let selected_session_revision = if probe.candidate == "hosted" {
        if active_build_id.as_deref() != Some(probe.payload_build_id.as_str()) {
            return Err("probe shell is not the native active generation".into());
        }
        let connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        Some(
            local_data::read_selected_session(&connection, &authority.partition_key)?
                .session
                .revision,
        )
    } else {
        None
    };
    let (active_isolation_proof_schema, latest_quarantine) = {
        let connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        let isolation = active_build_id
            .as_deref()
            .map(|build_id| {
                connection.query_row(
                    "SELECT isolation_proof_schema FROM shell_generations WHERE build_id = ?1",
                    [build_id],
                    |row| row.get::<_, Option<String>>(0),
                )
            })
            .transpose()
            .map_err(|error| error.to_string())?
            .flatten();
        let quarantine = connection
            .query_row(
                "SELECT build_id, failure_count, failure_code, retry_after_unix_ms
                 FROM shell_generations
                 WHERE status = 'quarantined' AND failure_code IS NOT NULL
                 ORDER BY quarantined_at_unix_ms DESC, build_id DESC LIMIT 1",
                [],
                |row| {
                    Ok(QuarantineEvidence {
                        build_id: row.get(0)?,
                        failure_count: row.get(1)?,
                        failure_code: row.get(2)?,
                        retry_after_unix_ms: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(|error| error.to_string())?;
        (isolation, quarantine)
    };
    let native_evidence = NativeProbeEvidence {
        active_build_id,
        previous_build_id,
        candidate_build_id,
        active_isolation_proof_schema,
        latest_quarantine,
        local_projection_loaded: selected_session_revision.is_some(),
        selected_session_revision,
        partition_validated: authority.can_read_offline,
        synthetic_identity: authority.synthetic_identity,
        local_schema_version: local_data::LOCAL_SCHEMA_VERSION,
        sync_protocol_version: local_data::SYNC_PROTOCOL_VERSION,
        custom_protocol: probe.candidate == "hosted",
        content_origin: {
            let url = window.url().map_err(|error| error.to_string())?;
            let host = url
                .host_str()
                .ok_or_else(|| "desktop content URL has no host".to_string())?;
            format!("{}://{}", url.scheme(), host)
        },
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "system clock is before UNIX epoch".to_string())?
        .as_millis();
    let payload = serde_json::to_vec_pretty(&StoredProbe {
        recorded_at_unix_ms: now,
        probe: &probe,
        native_evidence,
    })
    .map_err(|error| error.to_string())?;
    let final_path =
        std::env::temp_dir().join(format!("fs-desktop-spike-{}.json", probe.candidate));
    let pending_path = final_path.with_extension("json.pending");
    fs::write(&pending_path, payload).map_err(|error| error.to_string())?;
    fs::rename(&pending_path, &final_path).map_err(|error| error.to_string())
}

fn validate_probe(probe: &SpikeProbe) -> Result<(), String> {
    if !matches!(probe.candidate.as_str(), "hosted" | "bundled") {
        return Err("unknown spike candidate".into());
    }
    if !matches!(
        probe.boot_mode.as_str(),
        "online" | "offline" | "compatibility-blocked" | "degraded" | "auth-required" | "unknown"
    ) {
        return Err("unknown boot mode".into());
    }
    for (value, max, label) in [
        (&probe.shell_version, 80, "shell version"),
        (&probe.cache_version, 80, "cache version"),
        (&probe.payload_build_id, 80, "payload build ID"),
    ] {
        if value.trim().is_empty() || value.len() > max {
            return Err(format!("invalid {label}"));
        }
    }
    if !probe.unauthorized_command_rejected {
        return Err("ungranted native command was not rejected".into());
    }
    Ok(())
}

#[tauri::command]
fn internal_denied_probe() -> bool {
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ci_trace::record("runtime run entered");
    tauri::Builder::default()
        .manage(DesktopState::default())
        .register_uri_scheme_protocol("fs-active", protocol::active)
        .register_uri_scheme_protocol("fs-candidate", protocol::candidate)
        .register_uri_scheme_protocol("fs-recovery", protocol::recovery)
        .setup(|app| {
            ci_trace::record("setup entered");
            let root = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let runtime = DesktopRuntime::initialize(&root)?;
            ci_trace::record("desktop runtime initialized");
            app.state::<DesktopState>().install(runtime)?;
            ci_trace::record("desktop runtime installed");
            windows::create_main(app)?;
            ci_trace::record("main window created");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_bootstrap_status,
            desktop_prepare_shell_update,
            desktop_candidate_status,
            desktop_candidate_confirm,
            desktop_candidate_report_failure,
            desktop_open_recovery,
            desktop_recovery_status,
            desktop_recovery_read_selected_session,
            desktop_session_authority,
            desktop_read_selected_session,
            desktop_session_sync_status,
            desktop_apply_session_operation,
            record_spike_probe,
            internal_denied_probe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FS desktop local integration");
}
