mod authority;
mod bootstrap;
#[cfg(test)]
mod bootstrap_tests;
mod local_data;
mod local_schema;
mod runtime;
mod server;
mod shell_contract;
#[cfg(test)]
mod sync_contract;

use authority::{SessionAuthoritySnapshot, SessionContextProof};
use bootstrap::{BootstrapStatus, ConfirmCandidateRequest, PrepareResult, RUNTIME_CAPABILITIES};
use local_data::{OperationReceipt, SessionOperationRequest, SessionSlice};
use runtime::{DesktopRuntime, DesktopState};
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    native_app_version: String,
    runtime: &'static str,
    local_schema_version: u32,
    sync_protocol_version: u32,
    capabilities: Vec<&'static str>,
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
    local_projection_loaded: bool,
    selected_session_revision: Option<i64>,
    partition_validated: bool,
    synthetic_identity: bool,
    local_schema_version: u32,
    sync_protocol_version: u32,
}

fn runtime(
    state: &tauri::State<'_, DesktopState>,
) -> Result<std::sync::Arc<DesktopRuntime>, String> {
    state.runtime()
}

#[tauri::command]
fn desktop_runtime_info(app: tauri::AppHandle) -> RuntimeInfo {
    RuntimeInfo {
        native_app_version: app.package_info().version.to_string(),
        runtime: "tauri",
        local_schema_version: local_data::LOCAL_SCHEMA_VERSION,
        sync_protocol_version: local_data::SYNC_PROTOCOL_VERSION,
        capabilities: RUNTIME_CAPABILITIES.to_vec(),
    }
}

#[tauri::command]
fn desktop_bootstrap_status(
    state: tauri::State<'_, DesktopState>,
) -> Result<BootstrapStatus, String> {
    let runtime = runtime(&state)?;
    let shell = runtime
        .shell
        .read()
        .map_err(|_| "shell state lock poisoned".to_string())?;
    Ok(bootstrap::status(&shell))
}

#[tauri::command]
async fn desktop_prepare_shell_update(
    state: tauri::State<'_, DesktopState>,
) -> Result<PrepareResult, String> {
    let runtime = runtime(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut shell = runtime
            .shell
            .write()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        let mut connection = runtime
            .connection
            .lock()
            .map_err(|_| "local database lock poisoned".to_string())?;
        bootstrap::download_and_stage(&runtime.root, &mut connection, &mut shell)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn desktop_confirm_shell_candidate(
    request: ConfirmCandidateRequest,
    state: tauri::State<'_, DesktopState>,
) -> Result<BootstrapStatus, String> {
    let runtime = runtime(&state)?;
    let mut shell = runtime
        .shell
        .write()
        .map_err(|_| "shell state lock poisoned".to_string())?;
    let mut connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    bootstrap::confirm_candidate(&mut connection, &mut shell, &request)
}

#[tauri::command]
fn desktop_session_authority(
    state: tauri::State<'_, DesktopState>,
) -> Result<SessionAuthoritySnapshot, String> {
    let runtime = runtime(&state)?;
    let authority = runtime
        .authority
        .lock()
        .map_err(|_| "session authority lock poisoned".to_string())?;
    Ok(authority.snapshot())
}

#[tauri::command]
fn desktop_read_selected_session(
    context: SessionContextProof,
    state: tauri::State<'_, DesktopState>,
) -> Result<SessionSlice, String> {
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
        bootstrap::validate_frontend_build(&shell, &context.frontend_build_id)?;
    }
    let connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    local_data::read_selected_session(&connection, &context.partition_key)
}

#[tauri::command]
fn desktop_apply_session_operation(
    request: SessionOperationRequest,
    state: tauri::State<'_, DesktopState>,
) -> Result<OperationReceipt, String> {
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
        bootstrap::validate_frontend_build(&shell, &request.context.frontend_build_id)?;
    }
    let mut connection = runtime
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())?;
    local_data::apply_operation(&mut connection, &request, authority::now_unix_ms()?)
}

#[tauri::command]
fn record_spike_probe(
    probe: SpikeProbe,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    validate_probe(&probe)?;
    let runtime = runtime(&state)?;
    let (active_build_id, previous_build_id) = {
        let shell = runtime
            .shell
            .read()
            .map_err(|_| "shell state lock poisoned".to_string())?;
        (
            shell.active.as_ref().map(|item| item.build_id.clone()),
            shell.previous.as_ref().map(|item| item.build_id.clone()),
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
    let native_evidence = NativeProbeEvidence {
        active_build_id,
        previous_build_id,
        local_projection_loaded: selected_session_revision.is_some(),
        selected_session_revision,
        partition_validated: authority.can_read_offline,
        synthetic_identity: authority.synthetic_identity,
        local_schema_version: local_data::LOCAL_SCHEMA_VERSION,
        sync_protocol_version: local_data::SYNC_PROTOCOL_VERSION,
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
        (&probe.shell_version, 40, "shell version"),
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
    tauri::Builder::default()
        .manage(DesktopState::default())
        .setup(|app| {
            let root = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let runtime = DesktopRuntime::initialize(&root)?;
            app.state::<DesktopState>().install(runtime.clone())?;
            server::start(runtime)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_bootstrap_status,
            desktop_prepare_shell_update,
            desktop_confirm_shell_candidate,
            desktop_session_authority,
            desktop_read_selected_session,
            desktop_apply_session_operation,
            record_spike_probe,
            internal_denied_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running FS desktop architecture spike");
}
